# API error handling (CM-024)

Status: Implemented. The CM-024 dispatch and owner-authorized implementation plan define this contract.

REST failures use Spring `ProblemDetail` and `application/problem+json`. Successful responses retain their existing resource/envelope format. `GlobalExceptionHandler` extends `ResponseEntityExceptionHandler` so framework errors (malformed JSON, field validation, unsupported method/media type, missing routes) use the same shape. Framework errors keep their actual HTTP status; invalid request failures use `INVALID_ARGUMENT`. Field validation uses `VALIDATION_FAILED` and includes field/message entries without rejected values.

```json
{
  "type": "urn:chatmee:error:already-participant",
  "title": "Conflict",
  "status": 409,
  "detail": "User is already in the room",
  "instance": "/api/v1/chatrooms/room/join",
  "code": "ALREADY_PARTICIPANT",
  "errors": []
}
```

| Code | HTTP status | Source |
| --- | --- | --- |
| ROOM_NOT_FOUND | 404 | ChatRoomNotFoundException |
| USER_NOT_FOUND | 404 | UserNotFoundException |
| FORBIDDEN_ACTION | 403 | ForbiddenActionException, UnauthorizedRoomActionException, access denial |
| ALREADY_PARTICIPANT | 409 | UserAlreadyInRoomException, participant unique-index collision |
| ROOM_FULL | 409 | RoomCapacityExceededException |
| DUPLICATE_RESOURCE | 409 | DuplicateResourceException |
| VALIDATION_FAILED | 400 | Bean Validation field errors |
| INVALID_ARGUMENT | 400 | InvalidRequestException, invalid request arguments |
| UNAUTHENTICATED | 401 | Missing/expired API authentication |
| RATE_LIMITED | 429 | Existing RateLimitingFilter rejection |
| INTERNAL_ERROR | 500 | Unexpected/infrastructure failure |

`ChatMeeException` is an abstract runtime exception holding an `ErrorCode`. Existing domain exceptions and `InvalidRequestException` extend it. The shadowing custom `IllegalArgumentException` and legacy `ErrorResponse` are removed. `DatabaseOperationException` is retained only for the existing specific DataAccessException translation in message retrieval; domain failures propagate unchanged. Participant persistence translates `DuplicateKeyException` into `ALREADY_PARTICIPANT` so a concurrent duplicate join also returns 409.

API authentication failures under `/api/**` return 401 JSON with no Location header. Filter access denials under the same prefix return 403 JSON. Browser routes retain the `/login` entry point and OAuth authorization flow. Existing CSRF/logout policy is unchanged by CM-024; CM-010 owns those lines. Rate limiting uses the same JSON contract.

Rate limiting (CM-030): a fixed one-minute Redis window keyed by `user:<name>` for authenticated requests and `ip:<remoteAddr>` otherwise (20/min public, 100/min authenticated). The filter never parses `X-Forwarded-For` itself; in production `server.forward-headers-strategy=native` lets Tomcat derive the remote address from trusted internal proxies only, so a forged header cannot rotate the key. Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`; a 429 adds `Retry-After` (seconds until the window resets). If Redis fails, the request is served and a WARN is logged (fail-open).

500 responses expose only `An unexpected error occurred`. The advice logs an unexpected exception once with its stack trace; REST controllers and synchronous services no longer catch/log/rethrow broad exceptions. STOMP errors retain their existing user queue contract.

Axios redirects 401 failures to `/login` unless already there (and checks for a browser environment). Other responses reject with an Error whose message comes from `detail`, with the Axios failure retained as `cause`. `hooks/useRoomMessage.ts` reads `detail` and falls back to Error.message. Existing `react-hot-toast` presentation remains in feature stores/components; no toast wiring is added here. Follow-up toast consumers include `lib/stores/chatRoomsStore.ts` create/join/leave/delete catches and `components/room/RoomSettingsDialog.tsx`.

Verification: `GlobalExceptionHandlerTest` covers 400/403/404/405/409/500 schemas, `SecurityProblemDetailIT` covers 401/no redirect and authenticated filter denial plus browser redirect, service regression tests cover duplicate joins, unique-index races and invalid room names, and `lib/api/apiClient.test.ts` covers interceptor behavior. CM-022 expands controller slices; CM-026 documents the schema in OpenAPI.

## Session caller identity (CM-040)

`CustomOAuth2UserService` returns an immutable, serializable `UserPrincipal` after the existing user upsert. Its `getName()` is the internal `User.id`; provider registration id, provider subject, display name, attributes and granted authorities remain available in the session. REST controllers resolve `@CurrentUser UserPrincipal` through `CurrentUserArgumentResolver`, registered by `CurrentUserWebMvcConfig`. Missing, unauthenticated or foreign principals (including old OAuth sessions) raise an authentication exception handled as the existing 401 `UNAUTHENTICATED` problem response. The public `/auth/status` still returns false to anonymous callers and rejects foreign authenticated principals with 401; no security paths change.

Services receive the internal caller id. Provider/subject lookup occurs only during OAuth login; account existence/profile checks use internal ids and retain the existing missing-account errors. STOMP continues to use the internal-id principal set by `AuthChannelInterceptor`; message construction, membership checks, persistence and response mapping live in `MessageService`, with controllers responsible for delivery and the existing private error queue. Room ownership, role, capacity and membership rules are unchanged.

`AuthResponse`, `UserResponse`, `ChatRoomResponse` and `ChatMessageResponse` are records with static `from(...)` factories. JSON names, null inclusion, room LocalDateTime fields, message Instant timestamps, and `isUpdated`/`isDeleted` remain unchanged. Request DTOs and the embedded room settings contract are retained within this ticket's scope. No mapper dependency is added.

Verification: `CurrentUserArgumentResolverTest`, `UserPrincipalTest`, `CustomOAuth2UserServiceTest`, `ControllerArchitectureTest`, and the existing REST/STOMP/service regression suites.
