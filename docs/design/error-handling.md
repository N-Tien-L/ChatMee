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
