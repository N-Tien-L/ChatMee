# V0 readiness review A: backend, security, spec

> Historical readiness review. Findings below describe the reviewed baseline, before the
> integration fixes. For subsequent fixes and checks, see
> [CM-067 integration](CM-067-INTEGRATION-REPORT.md) and [v0 smoke](V0-SMOKE-REPORT.md).
> Production owner actions still require separate confirmation.

- Reviewer: A (backend / security / spec). Reviewer B covers the frontend.
- Date: 2026-10-15
- Branch: `feat/CM-084-mobile-account-menu` at `b46a2d5` (tracked tree clean; 5 commits ahead of `develop`, of which only
  `d974ecb` and `c9b6ff4` touch `backend/`; `main` is 70 commits behind this branch)
- Mode: read-only. No source change, no commit, no push, no production call, no `.env*` read (only `*.example` and the
  deleted example files through `git show`).

## 1. Verdict: GO WITH CONDITIONS (backend and security only)

The backend is in good shape. `./mvnw verify` is green twice (569 unit tests + 105 integration tests, 0 skipped, no
`@Disabled`, JaCoCo check met). Identity always comes from the principal, every STOMP destination is on the allowlist and
documented, and I found no IDOR in rooms, DMs, history, invitations, DM requests, blocks or reports. Nothing in the
backend code blocks a deploy. The release is not ready yet for other reasons. The production secret rotation (O-1) has been
open since CM-001. The production environment variables are no longer documented anywhere a deployer would look. The
SPEC-008 release gate (AC-008-12) cannot pass as the spec is written now. One input-validation gap (room `settings`)
should be closed before strangers use the app. Conditions are listed in 1.1. Reviewer B's frontend verdict is still
needed; CM-066, CM-079 and CM-080 are still `todo` on the board.

### 1.1 Conditions for GO
1. **Owner confirms O-1**: the Google and GitHub OAuth secrets and the Atlas and Upstash passwords are rotated (A-01).
2. **Production environment documented**: the variable list is restored in a committed doc, the Render service is checked
   against it, and the single-instance setting (D-11) is confirmed (A-03).
3. **Room `settings` bounded**: `welcomeMessage` gets a size limit and `settings` is validated, or the field is ignored on
   input (A-02). This is a small fix.
4. **Release gate made satisfiable**: the owner amends SPEC-008 AC-008-16 (inbound ordering is a v0 known gap per the
   2026-10-12 owner decision), and the spec status lines are updated to match the code (A-04, A-05). CM-067 step 1
   already plans most of this.
5. **CM-067 owner steps**: run the backfill in dry-run mode, then with `APPLY=true` after an Atlas snapshot; run the
   full-stack local smoke checklist; deploy backend and frontend together.

## 2. Commands run

| Command | Result |
|---|---|
| `docker info` | Docker 29.8.0 available; Testcontainers ran |
| `java -version` | OpenJDK 21.0.12 locally (CI and the Dockerfile use JDK 17; I did not run a JDK 17 build) |
| `cd backend && ./mvnw -B verify` | **BUILD SUCCESS** in 2:40. Surefire `Tests run: 569, Failures: 0, Errors: 0, Skipped: 0`; Failsafe `Tests run: 105, Failures: 0, Errors: 0, Skipped: 0`; `All coverage checks have been met.` |
| `cd backend && ./mvnw -B test` (separate run, also a re-run to look for flaky tests) | **BUILD SUCCESS** in 33 s, `Tests run: 569, Failures: 0, Errors: 0, Skipped: 0`. Same counts as the first run; no flaky test seen in two runs |
| `grep -rn "@Disabled\|@Ignore\|assumeTrue\|Assumptions\." backend/src/test` | no hits |
| Spec-citation check: every `Class#method` cited in `docs/specs/SPEC-00*.md` (213 unique) looked up in the test sources | 207 found, 6 missing (see A-10) |
| `git show d974ecb^:backend/.env.prod.example`, `git show d974ecb --stat` | Shows the deleted env examples (known item 1) |
| `git merge-base --is-ancestor` for the CM tickets against `main` and `develop` | CM-028 and CM-049 are on `main`; CM-060 and later (all v0 work) are only on `develop` |

Log notes: the `WARN` lines in the verify log are expected test scenarios (Redis down, broadcast failure, 405 on the
removed direct-add endpoint). They contain ids and exception class names only, no content or tokens. The surefire
`Tests run: 0` lines for `AuthChannelInterceptorTest` and `WsTokenServiceTest` are the known `@Nested` reporting artefact;
their nested classes report 23 and 6 tests.

## 3. Findings

Ranked by severity. "Expected" quotes the spec or AGENTS.md; "Fix" is a suggestion only; nothing was applied.

### A-01 · High (Blocker until the owner confirms) · Production secret rotation still open
- Where: `docs/plan/BOARD.md:6` (CM-001 "merged (secret rotation pending: owner)"); `docs/plan/MVP_V0_PLAN.md:64`
  (`- [ ] O-1 Rotate Google/GitHub OAuth secrets, Atlas and Upstash passwords (pending since CM-001, AUDIT 0.2). Most important.`);
  `docs/audit/AUDIT_REPORT.md:20` (before CM-001, `/actuator/env` on production likely exposed `GOOGLE_CLIENT_SECRET`,
  `GITHUB_CLIENT_SECRET`, `MONGO_URI_PROD` and `REDIS_URL`).
- Expected: SPEC-008 AC-008-12 "production secrets are rotated" before release.
- Actual: no record that it was done. I cannot verify it (no production access, by rule).
- Fix: the owner rotates the secrets, updates the Render values, and ticks O-1 with a date.

### A-02 · Medium · Room `settings` are stored without validation or size limit; an entity class is used in the API
- Where: `backend/src/main/java/com/lnt/chatmee/dto/request/CreateChatRoomRequest.java:49` and
  `UpdateChatRoomRequest.java:24` (`private RoomSettings settings;`, no `@Valid`, no constraint);
  `model/ChatRoom.java:101` (`private String welcomeMessage;`); `service/policy/GroupRoomPolicy.java:22` and
  `service/ChatRoomService.java:341` (the request object is persisted as is); `dto/response/ChatRoomResponse.java:28`
  (`RoomSettings settings` returned to every member).
- Evidence: `RoomSettings` is the nested class of the `@Document` entity `ChatRoom`. No `@Size` exists on
  `welcomeMessage`, and no request-body size limit is configured (`application*.properties` have none; Tomcat's
  `max-http-form-post-size` does not apply to JSON). The only test that touches it
  (`ChatRoomControllerWebMvcTest:101`) sends `"welcomeMessage":"hi"`. No test covers a large value.
- Failure scenario: any signed-in user creates a room (20 per day) or, as OWNER/ADMIN, sends `PUT /api/v1/rooms/{id}` (100
  per minute) with a `welcomeMessage` of several megabytes. The value is stored, up to the 16 MB Mongo document limit. It is
  then returned in every member's `GET /rooms` and pushed in every `ROOM_UPDATED`/`ROOM_ADDED` event, because `{room}` is
  the same `ChatRoomResponse` (AC-008-1). This gives storage and bandwidth amplification. Very large WebSocket frames can
  also hit the 512 KB send-buffer limit (`WebSocketConfig`), which closes the receiving sessions.
- Expected: SPEC-008 §2 says the fields "have no behaviour… the backend field stays until v1". It does not allow
  unbounded input. AGENTS.md §3: "Entities MUST NOT be returned directly in APIs: always map to DTOs (records)."
- Fix (small): add a `RoomSettingsRequest` record with `@Size(max = 500) welcomeMessage`, `@Valid` on the field, and a
  response record. Simpler for v0: ignore `settings` on input and keep the stored default. Add a test that a 501-character
  `welcomeMessage` returns 400.

### A-03 · Medium · Production environment variables are not documented; GitHub OAuth is required in prod although docs call it optional
- Where: `backend/.env.prod.example` and `backend/.env.dev.example` were deleted in `d974ecb`. `backend/.env.example`
  lists only `MONGO_URI_DEV`, `PORT`, `GOOGLE_*`, `GITHUB_*`. `application-prod.properties` needs `MONGO_URI_PROD`,
  `REDIS_URL`, `APP_CLIENT_URL`, `GOOGLE_CLIENT_ID/SECRET` and `GITHUB_CLIENT_ID/SECRET`, all as `${VAR}` without a default.
- Evidence: `grep -rn "REDIS_URL\|APP_CLIENT_URL\|MONGO_URI_PROD"` over `*.md`, `*.yml`, `*.example` finds them only in
  `docs/ops/upgrade-spring-boot-4.md:85-95,169-170` (a migration note), `docs/audit/AUDIT_REPORT.md` (Vietnamese
  audit) and the BOARD. `README.md` and `backend/README.md` have no production section. There is no `render.yaml`, so
  the health-check path, instance count (D-11: one instance) and env vars exist only in the Render dashboard.
- Expected: AGENTS.md §2 tells contributors to copy `.env.example`. A deployer needs one authoritative list.
- Impact: the existing Render service presumably still has its values, so a redeploy works. A new or recreated service
  fails at startup on unresolved placeholders. The deleted example called GitHub "(Optional)", but prod cannot start
  without `GITHUB_CLIENT_ID`/`SECRET`.
- Fix: restore a production section (README or `docs/ops/deploy.md`) listing every variable, which ones are required, the
  Render health-check path `/actuator/health`, single instance, and `SPRING_PROFILES_ACTIVE=prod` (set by the
  Dockerfile). Optionally commit a `render.yaml` without secrets.

### A-04 · Medium · Release gate AC-008-12 cannot pass as written: AC-008-16 is a declared known gap without a spec amendment
- Where: `docs/specs/SPEC-008-mvp-v0.md` AC-008-16 ("Inbound frames of one session are processed in order…") still
  says `-> Test: planned (CM-068…)`. AC-008-12 requires "every AC above… Implemented".
- Evidence: `docs/plan/BOARD.md` note 2026-10-12 M1: "Owner decision: WS-A14 (inbound ordering, AC-008-16) is a v0 known
  gap"; `docs/plan/V1_BACKLOG.md` last row of the review table. The Redis half of AC-008-16 is implemented and tested
  (`AuthChannelInterceptorTest#preSend_redisUnavailableAtConnect_rejectsWithoutTokenOrCause`,
  `StompMessagingIT#connect_redisUnavailableDuringTokenCheck_receivesErrorWithoutToken`).
- Expected: an Approved spec matches the decision; I must not edit it (AGENTS.md §7).
- Fix: the owner amends SPEC-008 (§2 non-goal or an AC-008-16 split) and records it in §10.

### A-05 · Medium · Spec status lines are stale against the code
- Evidence (tests exist and pass, but the spec still says "planned"):
  - AC-008-13: `MessageServiceTest#sendMessage_sameClientMessageIdTwice_storesOnlyOneMessage`,
    `MessageRepositoryIT#save_concurrentDuplicateClientMessageId_storesExactlyOneRow`.
  - AC-008-15: `StompMessagingIT#sendMessage_twoSessionsOfOneUser_privateErrorReachesOnlySendingSession`.
  - AC-009-14: `DirectMessageRequestServiceTest#checkCanRequest_dailyDmRequestLimitReached_throwsRateLimitExceeded`,
    `#resolveRequested_sameSenderAgain_doesNotConsumeDailyDmRequestLimit`.
  - AC-009-20: `ReportServiceTest` (10) and `ReportControllerWebMvcTest` (9), including
    `createReport_withNoteAndMessageContent_logsOnlyIdsAndReason` and `createReport_messageInRoomReporterIsNotIn_throwsRoomNotFound`.
  - AC-009-28 says both "Test: planned (CM-077)" and "Implemented".
  - `docs/plan/BOARD.md` still lists CM-066, CM-079 and CM-080 as `todo`, while CM-084 commits add invitations and the inbox
    on the frontend (Reviewer B to confirm).
- Expected: AGENTS.md §5 step 5 ("update the spec (`Implemented`, log the test name)").
- Fix: CM-067 step 1.

### A-06 · Low · README does not list the WebSocket revocation known gap that SPEC-008 says it lists
- Where: `README.md:94-106` (Security Model has only "Known gap: online presence is visible to every signed-in user").
- Expected: SPEC-008 §2: "… this is listed as a known gap in the README security model"; `MVP_V0_PLAN.md` CM-067 step 1
  plans the line.
- Fix: add the line in CM-067 (see known item 3 for the risk assessment).

### A-07 · Low · History endpoint tells non-members that a room exists (403 vs 404)
- Where: `backend/src/main/java/com/lnt/chatmee/service/MessageService.java:193-202`. `existsById` gives 404 for an unknown
  id, then a non-member gets 403 `ForbiddenActionException`. This is locked in by
  `MessageControllerWebMvcTest#getRecentMessages_nonMember_returns403Problem`.
- Expected: SPEC-002 §5 "Caller is not a member → Not found, to avoid revealing the room → 404". `GET /rooms/{id}`,
  members, read marker and reports all follow that rule. `existsById` also counts soft-deleted rooms. V1_BACKLOG has only
  the soft-deleted case ("404 instead of 403 for a soft-deleted room").
- Impact: low. Room ids are Mongo ObjectIds, so the oracle needs a known id. No content leaks.
- Fix: map non-member to `ChatRoomNotFoundException` and update the test; or the owner records it as accepted for v0.

### A-08 · Low · `tempId` / `clientMessageId` has no length limit and is stored and indexed
- Where: `dto/request/ChatMessageRequest.java:27` (`private String tempId;`, no `@Size`); stored as
  `Message.clientMessageId` (`model/Message.java:36`) in the unique index `messages_room_sender_client` (`:24-25`) and
  echoed in every broadcast and history page.
- Impact: a member can attach about 120 KB of junk per message (bounded by the 128 KB STOMP frame limit and 10 messages
  per 5 s). The room then broadcasts it and pages it to every member.
- Fix: `@Size(max = 64)` (the client sends UUIDs), plus a validation test.

### A-09 · Low · `backend/README.md` API overview and root README roadmap are stale
- `backend/README.md` "Endpoints" and "WebSocket" sections list removed routes: `GET /users/provider/{provider}/id/{providerId}`
  (removed in CM-047; `UserApiControllerTest#providerEndpoint_returns404`), `POST /rooms/{roomId}/members` (removed in
  CM-070, now 405), and `/app/chat.addUser` (removed in CM-056). They miss `/user/queue/events`, invitations, DM requests,
  blocks, reports, hide, read marker, member role and member list. They also describe a `{"status","message","data"}`
  envelope, while errors are `ProblemDetail` and successes use `ApiResponse{data,message}`. "All requests must be made over
  HTTPS" is wrong for local use. `/app/presence` wording is W-3, already planned in CM-067.
- `README.md` Roadmap lists "Cursor-based message history… (CM-044)" as planned (merged) and "ownership transfer" as not
  planned (automatic transfer shipped in CM-076).
- The new "Local Development" section of `backend/README.md` (c9b6ff4) matches reality: `local` profile, `.env` import
  from `backend/`, ports 8080/27017/6379, callbacks.
- Fix: CM-067 step 1, or point `backend/README.md` at `/v3/api-docs` and `docs/design/websocket-protocol.md`
  instead of keeping a hand-written list.

### A-10 · Low · Specs cite tests that no longer exist (6 of 213) and one spec contradicts the code
- Missing methods: `ChatRoomControllerAuthorizationTest#addParticipant_{adminAssigningAdmin_returnsForbidden,
  directRoom_returnsForbiddenAction, nonParticipant_returnsForbidden, ownerAssigningAdmin_returnsOk}` (AC-002-5, AC-003-3;
  the endpoint was removed, now `ChatRoomControllerWebMvcTest#addParticipant_directAddRemoved_returns405WithoutAddingMember`),
  `ChatRoomServiceTest#createRoom_directRoom_createsSuccessfully` (AC-003-1; now
  `createRoom_directRoom_createsRequestedRoomWithOnlySenderAndOpensRequest`), and
  `ChatRoomServiceTest#leaveChatRoomById_creator_throwsException` (AC-002-7; superseded by AC-009-24). All of them are
  superseded ACs, so the code is fine; only the citations are stale.
- SPEC-001 AC-001-2 says "no unique index on `(provider, providerId)`… Planned: v1 (D-09)". But
  `model/User.java:24` declares `@CompoundIndex(name = "provider_providerId_idx", … unique = true)` (since `4955548`,
  2025-09-05), and `spring.data.mongodb.auto-index-creation=true` (`application.properties`, on `main` since CM-028). So
  the index is created at startup, or startup would fail on duplicates. Production has run this config since the
  2026-10-11 main merge, so this deploy adds no new risk. The spec and D-09 describe a state that does not exist.
- Fix: owner decision; update the AC-001-2 line and D-09 to match, and add the concurrency test planned for v1.

### A-11 · Low · HTTP sessions live in memory; every deploy or restart signs everybody out
- Where: `backend/pom.xml` has no `spring-session-*`. Sessions are Tomcat in-memory with the default 30-minute idle timeout.
- Impact: a deploy, crash or Render restart sends every user to `/login` (the frontend handles 401 per AC-008-14). It also
  rules out a second instance (together with the simple broker, D-11). Acceptable for v0 at one instance.
- Fix: v1 follow-up (Spring Session on Redis) together with multi-instance fan-out.

No Blocker or High finding in the backend code itself.

## 4. Known items

### Known item 1: deleted env examples and production variables: **Confirmed**
- `git show d974ecb --stat`: `backend/.env.dev.example | 13 -`, `backend/.env.prod.example | 19 -`.
- `backend/.env.example` has no `REDIS_URL`, `APP_CLIENT_URL` or `MONGO_URI_PROD`.
- Where they are documented now: only `docs/ops/upgrade-spring-boot-4.md` (migration note) and the audit and board. Not in
  `README.md` or `backend/README.md`.
- A first Render deploy from the docs would miss: `MONGO_URI_PROD`, `REDIS_URL`, `APP_CLIENT_URL` and the fact that
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are required. Startup fails on the first unresolved placeholder.
  `SPRING_PROFILES_ACTIVE=prod` and `PORT=10000` come from the Dockerfile; Render overrides `PORT`. Also outside the repo:
  the health-check path, single instance (D-11), and the OAuth callback URLs `${APP_CLIENT_URL}/login/oauth2/code/{google,github}`
  registered with both providers. Frontend side (out of area): `NEXT_PUBLIC_WS_URL` must point to the Render `wss://…/ws`
  URL; `frontend/.env.example` shows only the local value. → Finding A-03.

### Known item 2: Boot 4 property names: **Confirmed correct**
- `spring.mongodb.uri` is the Boot 4 name. `application-prod.properties:1` (`${MONGO_URI_PROD}`) and
  `application-dev.properties` (`${MONGO_URI_DEV}`) bind. Evidence: `PersistencePropertyBindingTest#prodProfile_envVariables_bindMongoUriAutoIndexAndRedisUrl`
  and `#devProfile_envVariable_bindsMongoUriAndAutoIndex` pass. They assert the connection string,
  `isAutoIndexCreation() == true` and, for prod, that `spring.data.redis.url=${REDIS_URL}` resolves host and port (so
  `spring.data.redis.*` is unchanged in Boot 4).
- `compose.yaml`: `SPRING_MONGODB_URI` is the relaxed-binding form of `spring.mongodb.uri` and overrides
  `application-local.properties`. `SPRING_DATA_REDIS_HOST=redis` matches `spring.data.redis.host`. Correct. The old
  `SPRING_DATA_MONGODB_URI` would have been ignored by Boot 4, so the compose `full` profile was pointing at
  `localhost:27017` inside the container before `d974ecb`.
- `application-dev.properties:2`: `spring.config.import=optional:file:.env.dev[.properties]` is valid Boot syntax. The path is
  relative to the working directory, so it works only when run from `backend/` (as `backend/README.md` says). It has no
  effect on prod (the Dockerfile forces `prod`; there is no `.env.dev` in the image).
- `application-local.properties`: Google `scope=profile,email` now matches dev and prod. Leaving out `openid` keeps Google
  on the OAuth2 user-info path, so `CustomOAuth2UserService` runs as in prod instead of the OIDC path. This is consistent.
- `prod` profile: no other Boot 3 names left (`server.servlet.session.cookie.*`, `server.forward-headers-strategy`,
  `logging.structured.format.console` are valid).

### Known item 3: no server-side WebSocket revocation on logout or session expiry: **Partly refuted, risk Low**
- Refuted: the README does **not** list this gap (A-06). SPEC-008 §2 and V1_BACKLOG do.
- Mechanics (code): the STOMP principal is set once at CONNECT from a single-use token (`AuthChannelInterceptor`). Nothing
  links it to the HTTP session. `POST /logout` invalidates the session only. A connected socket stays authenticated
  while heartbeats flow (10 s), with no time limit. An unused ws-token stays valid for at most 60 s (`WsTokenService`
  TTL, `getAndDelete`).
- Real risk: an attacker needs either a live socket in the victim's browser or a token issued in the 60 s before logout. In
  both cases they already had the session. Room authorization is still checked per frame (`RoomSubscriptionInterceptor`,
  CM-058), so a user removed from a room loses its frames at once whatever the socket state. The main exposures are a
  shared computer where the client failed to stop the socket on logout (CM-069 makes the client stop it), and the lack
  of any "kill all sessions" control after an account compromise (restarting the instance is the only one).
- Assessment: acceptable for v0, with one instance and no account-disable feature, on condition that the README states it
  (A-06). Keep WS-A02..A04 in v1.

### Known item 4: unused room settings: **Confirmed accepted and stored; not safe** → A-02
- Accepted on create and update, persisted, and returned to all members. No validation or size limit; the entity's
  nested class is used as both request and response type. The boolean fields are harmless (Jackson accepts `null` as
  `false` thanks to `fail-on-null-for-primitives=false`, which the test at `ChatRoomControllerWebMvcTest:101` shows).
  `welcomeMessage` is unbounded. DMs ignore `settings` on create (`DirectRoomPolicy:65`).

## 5. Spec traceability

Statuses: **Covered** = code and at least one passing test I found; **Partial** = part is missing or untested;
**Missing** = not implemented; **Conflict** = code and Approved spec disagree; **FE** = frontend AC, for Reviewer B (status
as the spec states it). Test names were checked against the sources; all ran green in the verify above. Paths are under
`backend/src/main/java/com/lnt/chatmee/`.

### SPEC-001 auth
| AC | Code | Test | Status |
|---|---|---|---|
| 001-1 | `service/CustomOAuth2UserService` | `CustomOAuth2UserServiceTest#loadUser_existingAndNewProviders_returnsSerializableInternalPrincipal` | Covered |
| 001-2 | same + `model/User.java:24` unique index | no concurrency test | Conflict (A-10): the index exists in code, the spec says it does not |
| 001-3 | `controller/AuthApiController#getCurrentUser` | `AuthControllerWebMvcTest#getCurrentUser_knownUser_returnsOwnProfile`, `#…_unauthenticated_returns401ProblemWithoutRedirect` | Covered |
| 001-4 | `config/SecurityConfig` logout | `CsrfSecurityTest#postLogout_redirects`, `#getLogout_doesNotLogout` | Covered (server); client FE |
| 001-5 | `SecurityConfig` `failureUrl(clientUrl + "/login?error=true")` | none | Partial (spec says default redirect; code has an explicit one; no test) |
| 001-6 | `application-prod.properties:14-15`, `SecurityConfig` CSRF | `CsrfSecurityTest#postWithoutCsrf_returnsForbidden`, `#postWithSpaToken_returnsOk` | Covered (cookie flags by config only, not tested in prod profile) |
| 001-7 | logging review | none (grep: all `log.*` calls carry ids or class names only) | Covered by review |
| 001-8 | `security/CurrentUserArgumentResolver` | `CurrentUserArgumentResolverTest#resolveArgument_userPrincipal_returnsInternalId`, `ControllerArchitectureTest` | Covered |
| 001-9 | frontend | — | FE (planned CM-069) |

### SPEC-002 rooms
| AC | Code | Test | Status |
|---|---|---|---|
| 002-1 | `dto/request/CreateChatRoomRequest`, `@RoomName` | `ChatRoomControllerValidationTest#createRoom_nameOf101Characters_returnsBadRequest` + 3 | Covered (but see A-02 for `settings`) |
| 002-2 | `ChatRoomService#getList` | `ChatRoomControllerWebMvcTest#listRooms_authenticated_returnsCallerRooms` | Covered |
| 002-3 | `ChatRoomService#discoverRooms` | `ChatRoomRepositoryIT#findDiscoverable_regexCharactersInQuery_matchedLiterally` + 3 | Covered |
| 002-4 | `PublicRoomPolicy`, `ParticipantService` | `ChatRoomControllerWebMvcTest#joinRoom_fullRoom_returns409Problem` + 3 | Covered |
| 002-5 | superseded by AC-009-1..5 | cited tests no longer exist (A-10) | Superseded |
| 002-6 | `ChatRoomService#deleteChatRoomById` | `SubscriptionRevocationIT#deleteRoom_subscribedMembers_receiveDeletedEventThenNothing` + 3 | Covered |
| 002-7 | superseded by AC-009-24 (owner may leave) | `SubscriptionRevocationIT#leaveRoom_*` (3) | Covered (revocation part); citation stale |
| 002-8 | `ChatRoomRepository` atomic `$inc`, unique participant index | `RoomMembershipIT#addParticipant_twentyConcurrentJoinsWithCapacityTen_exactlyTenSucceed` | Covered |
| §5 non-member → 404 | `MessageService.java:200` returns 403 for history | `MessageControllerWebMvcTest#getRecentMessages_nonMember_returns403Problem` | Conflict (A-07) |

### SPEC-003 DMs
| AC | Code | Test | Status |
|---|---|---|---|
| 003-1 | `DirectRoomPolicy` (now REQUESTED, AC-009-9) | `ChatRoomControllerValidationTest#createRoom_directMessageWithParticipantAndNoName_returnsCreated`, `ChatRoomServiceTest#createRoom_directRoom_createsRequestedRoomWithOnlySenderAndOpensRequest` | Covered (citation stale, A-10) |
| 003-2 | `ChatRoom.memberKey` unique sparse | `RoomMembershipIT#save_secondActiveDirectRoomForSamePair_isRejectedByUniqueMemberKey` + 2 | Covered |
| 003-3 | `DirectRoomPolicy` | `ChatRoomControllerAuthorizationTest#joinRoom_directMessageRoom_returnsForbidden` | Covered (add-participant citation stale) |
| 003-4 | `ChatRoomService#toResponses` | `ChatRoomServiceTest#toResponses_directRoom_showsOtherMemberAsCounterpart` | Covered |

### SPEC-004 messaging
| AC | Code | Test | Status |
|---|---|---|---|
| 004-1 | `AuthChannelInterceptor` CONNECT | `StompMessagingIT#connect_missingToken_receivesErrorAndCloses`, `#connect_reusedToken_…` | Covered |
| 004-2 | `AuthChannelInterceptor#authorizeSubscription` | `StompMessagingIT#subscribe_nonMember_receivesErrorAndCloses` | Covered |
| 004-3 | `ChatWebSocketController`, `MessageService` | `ChatWebSocketControllerAuthTest#sendMessage_forgedSender_savesAndBroadcastsPrincipalIdentity` + 3 | Covered |
| 004-4 | private errors | `StompMessagingIT#sendMessage_oversizedContent_deliversPrivateErrorOnlyToSender` | Covered |
| 004-5 | frontend | vitest (spec) | FE |
| 004-6 | `MessageController`, `MessageCursor` (limit clamp 100) | `MessageRepositoryIT#findPage_sameCreatedAt_pagesWithoutGapsOrDuplicates` + 4 | Covered |
| 004-7, 004-8 | frontend | vitest (spec) | FE |
| §5 idempotent send | now AC-008-13 | see below | Covered (spec table still says "Not implemented") |

### SPEC-005 presence and typing
| AC | Code | Test | Status |
|---|---|---|---|
| 005-1..3 | `PresenceService`, `presence-registry.lua`, `RedisPresenceSubscriber` | `PresenceRegistryIT` (5), `PresenceWebSocketControllerTest#handlePresenceEvent_forgedOfflineIdentity_cannotSetOffline` | Covered |
| 005-4 | `PresenceRestController` returns all online ids | — | Missing (deferred to v1, D-10; documented gap) |
| 005-5 | `TypingController` | `TypingControllerTest#handleTypingEvent_forgedIdentity_broadcastsPrincipalIdentity`, `#…_nonMember_dropsEvent` | Covered (server); client FE |
| 005-6 | frontend | — | FE |

### SPEC-006 user discovery
| AC | Code | Test | Status |
|---|---|---|---|
| 006-1..4 | `UserApiController`, `UserService`, `UserRepository` | `UserApiControllerTest#searchUsers_authenticated_returnsNoEmail`, `UserRepositoryIT#…_regexWildcard_matchesLiterally`, `UserApiControllerTest#providerEndpoint_returns404` | Covered |

### SPEC-007 rate limiting
| AC | Code | Test | Status |
|---|---|---|---|
| 007-1 | `security/RateLimitingFilter` | `RateLimitingFilterTest#filter_exceededLimit_returns429ProblemWithoutContinuing`, `RateLimitingIT#anonymousRequest_freshClient_isCountedExactlyOnce` | Covered |
| 007-2 | `getRemoteAddr()` + `forward-headers-strategy=native` | `RateLimitingFilterTest#filter_spoofedForwardedFor_keysOnRemoteAddress` | Covered (anonymous limit inert behind Vercel, BOARD 2026-10-11 note) |
| 007-3 | `security/WsRateLimitInterceptor` | `WsRateLimitIT#chatFrames_moreThanTenInOneWindow_dropsTheEleventh` | Covered |
| 007-4 | `RateLimitingService` fail-open + WARN | `RateLimitingServiceTest#check_redisUnavailable_failsOpen` | Partial (no metric, accepted) |
| 007-5 | `RateLimitingFilter.EXEMPT_PATHS` | `RateLimitingIT#health_anonymous_isNotRateLimited` | Covered |
| 007-6 | `RateLimitingService#checkDailyAction` | `RateLimitingServiceTest#checkDailyAction_twentyFirstDmRequest_throwsRateLimitExceededWithRetryAfter` | Covered |

### SPEC-008 MVP v0
| AC | Code | Test | Status |
|---|---|---|---|
| 008-1 | `service/UserEventPublisher`, interceptor allowlist | `AuthChannelInterceptorTest#preSend_userEventsSubscription_allowsOwnQueueOnly`, `UserEventsIT#sendMessage_unopenedRoom_deliversActivityToAllMemberSessionsButNotNonMember` | Covered |
| 008-2 | `ChatRoomService#getList`, `ChatRoomRepository#updateActivity` | `ChatRoomControllerWebMvcTest#getRooms_activityOrder_includesSummaryUnreadAndMyRole`, `ChatRoomRepositoryIT#updateActivity_olderOrEqualWrite_keepsLatestSummaryAndOtherFields` | Covered |
| 008-3 | `ChatRoomController#markRead` | `RoomUnreadIT#unreadCount_mixedMessages_excludesOwnSystemDeletedAndResetsAfterRead`, `ChatRoomControllerWebMvcTest#markRead_nonMember_returns404` | Covered |
| 008-4 | frontend | — | FE |
| 008-5 | `ParticipantService#getMembers` | `ParticipantServiceTest#getMembers_largeRoom_readsParticipantsAndUsersOnceWithoutPerMemberLookup` | Covered |
| 008-6 | `ChatRoomController#removeMember` | `ChatRoomControllerAuthorizationTest#removeMember_*` (7), `SubscriptionRevocationIT#removeMember_subscribedTabs_receiveRemovedEventAndNoFurtherRoomFrames` | Covered |
| 008-7 | `ParticipantService` SYSTEM messages | `MessageRepositoryIT#membershipSystemMessages_persisted_appearInHistoryAndNeverCountUnread` | Covered |
| 008-8..11 | frontend (backend parts: 008-8 DM reuse is AC-003-2) | — | FE |
| 008-12 | release process | — | Not met (A-01, A-04, A-05; CHANGELOG absent; no tag; backfill/smoke not done) |
| 008-13 | `Message.clientMessageId` partial unique index, `MessageService` | `MessageServiceTest#sendMessage_sameClientMessageIdTwice_storesOnlyOneMessage`, `MessageRepositoryIT#save_concurrentDuplicateClientMessageId_storesExactlyOneRow` | Covered (spec says planned, A-05) |
| 008-14 | frontend (server 401 from `ws-token`: `WsTokenServiceTest$TokenEndpoint#getWsToken_unauthenticatedSession_doesNotIssueToken`) | — | FE (server side Covered) |
| 008-15 | session-scoped errors | `StompMessagingIT#sendMessage_twoSessionsOfOneUser_privateErrorReachesOnlySendingSession` | Covered (spec says planned, A-05) |
| 008-16 | Redis-down CONNECT done; inbound ordering not | `AuthChannelInterceptorTest#preSend_redisUnavailableAtConnect_rejectsWithoutTokenOrCause` | Partial (ordering is an owner-declared gap; spec not amended, A-04) |

### SPEC-009 consent and safety (v0 ACs)
| AC | Code | Test | Status |
|---|---|---|---|
| 009-1..4 | `InvitationService`, `InvitationController` | `InvitationServiceTest` (40), `InvitationControllerWebMvcTest` (20), `InvitationIT#accept_twentyConcurrentAcceptsOfOneInvitation_createOneMembership`, `InvitationServiceTest#accept_notInvitee_throwsInvitationNotFound` | Covered |
| 009-5 | direct add removed | `ChatRoomControllerWebMvcTest#addParticipant_directAddRemoved_returns405WithoutAddingMember` | Covered |
| 009-9..13 | `DirectMessageRequestService`, `MembershipRequestExpiryJob` | `DirectMessageRequestServiceTest` (28), `DmRequestIT#acceptAndDecline_concurrentlyOnOneRequest_exactlyOneWinsWithConsistentState`, `#expiryJob_pastRequest_…` | Covered |
| 009-14 | `RateLimitingService` daily `dm-request=20` | `DirectMessageRequestServiceTest#checkCanRequest_dailyDmRequestLimitReached_throwsRateLimitExceeded` | Covered (spec says planned, A-05) |
| 009-15..19 | `BlockService`, `UserApiController` | `BlockServiceTest` (17), `UserApiControllerTest#blockUser_*`, `StompMessagingIT#sendMessage_blockedDm_bothGetForbiddenActionHistoryReadableAndUnblockRestores` | Covered |
| 009-20 | `ReportService`, `ReportController` | `ReportServiceTest` (10), `ReportControllerWebMvcTest` (9), `ReportRepositoryIT` (2) | Covered (spec says planned, A-05) |
| 009-21, 009-22 | `ChatRoomService#hideRoom`, DM delete guard | `ChatRoomServiceTest#hideRoom_directMessage_hidesForCallerOnlyAndNotifiesCallerSessions`, `ChatRoomControllerWebMvcTest#deleteRoom_directMessage_returns403UseHideProblem` | Covered |
| 009-23..25 | role change, owner transfer | `ChatRoomControllerAuthorizationTest#roleChange_*`, `RoomOwnershipIT#leaveChatRoomById_ownerAndAdminsLeaveConcurrently_keepsExactlyOneOwner` | Covered |
| 009-28 | `util/DisplayNames.DELETED_USER` | `MessageServiceTest#getMessages_missingSender_labelsDeletedUser` + 3 backend | Covered (`BlockService` keeps its own literal, BOARD M3 note) |
| 009-29 | `RateLimitingService#checkDailyAction` | 6 tests cited in spec | Covered |
| 009-6..8, 26, 27 | — | — | Out of v0 (D-02, D-03) |

SPEC-010 (room share links) is `Draft` and ADR-0007 is `Proposed`, both untracked; no backend code implements them
(`grep -i "share.\?link\|invite.\?link" backend/src`: no hits). They are not part of v0.

### Security checklist (AGENTS.md §3, §7)
| Rule | Result | Evidence |
|---|---|---|
| Identity only from principal | Pass | Every REST handler takes `@CurrentUser UserPrincipal`; STOMP handlers take `Principal`; the `userId` fields in `TypingMessage`/`PresenceMessage` are ignored (`TypingControllerTest#…_forgedIdentity_…`, `PresenceWebSocketControllerTest#…_forgedOnlineIdentity_onlyRefreshesOwnSession`) |
| No entity in API | **Fail (minor)** | `ChatRoom.RoomSettings` in request and response (A-02); everything else is a record DTO; `ControllerArchitectureTest` passes |
| No new `permitAll`, CSRF/CORS on, WS origins strict | Pass | `SecurityConfig` permitAll = `/`, `/login`, `/error`, `/actuator/health/**`, `/actuator/info`, `/ws/**` (unchanged since CM-053); CSRF cookie repo, `/ws/**` ignored (token-authenticated); CORS = `app.client.url` only; `/ws` `setAllowedOrigins(clientUrl)`; `StompMessagingIT#handshake_foreignOrigin_rejectedWith403` |
| STOMP destinations documented and allowlisted | Pass | Code: SEND `/app/chat.sendMessage`, `/app/presence`, `/app/rooms/*/typing`; SUBSCRIBE `/topic/presence`, `/user/queue/errors`, `/user/queue/events`, `/topic/rooms/{id}[/typing]` (membership; wildcard ids fail the membership lookup). All present in `docs/design/websocket-protocol.md`, as are all 7 event types (`ROOM_ADDED/REMOVED/UPDATED/ACTIVITY`, `INVITATION_RECEIVED/CHANGED`, `DM_REQUEST_RECEIVED`) |
| IDOR: rooms, DMs, history, presence, invitations, DM requests, blocks, reports | Pass except A-07 | Non-member → 404 tests for room, members, read marker, reports; invitee-only and recipient-only tests (`accept_notInvitee_…`, `accept_sender_throwsNotFoundWithoutDeciding`, `accept_strangerOrNoPendingRequest_throwsNotFound`); history 403 oracle (A-07); presence global (documented gap) |
| Rate limiting | Pass | REST 20/100 per min, STOMP per destination, daily action buckets; fail-open on Redis |
| ws-token lifecycle | Pass | 32 random bytes, Redis TTL 60 s, `getAndDelete` (atomic, cross-instance), header removed from the message before errors; Redis down at CONNECT → fixed message without cause (tested) |
| Session cookie behind the Vercel proxy | Pass (config) | prod `secure=true`, `same-site=lax`, HttpOnly by default; same origin via rewrites; OAuth callback is a top-level GET, so Lax sends the cookie |
| Actuator | Pass | `exposure.include=health,info`, probes off, details default `never`; `ActuatorSecurityTest` (5), `ActuatorSecurityIT` (3) |
| Logs | Pass | All `log.*` calls carry ids, action keys or exception class names; `ReportServiceTest#createReport_withNoteAndMessageContent_logsOnlyIdsAndReason`; `UserEventPublisherTest#roomActivity_deliveryFails_logsMetadataOnlyAndContinuesFanout`; OAuth success handler logs only at DEBUG and without user data |

### Deployment readiness
| Topic | Result |
|---|---|
| Profiles | `application.properties` defaults to `dev`; the Dockerfile forces `prod` (`ENV` + `--spring.profiles.active`). `local` and `dev` enable springdoc; prod has it off (base default) |
| Env vars | Undocumented for prod (A-03) |
| Health | `/actuator/health` (Docker `HEALTHCHECK` with busybox `wget`); includes the Mongo and Redis indicators, so an Upstash outage marks the instance DOWN (Render health-check config not in repo) |
| Mongo failure | Requests fail with 500 `ProblemDetail` (`GlobalExceptionHandler`, `DatabaseOperationException` tests); not exercised against a real outage |
| Redis failure | REST and daily limits fail open with WARN; presence registry fails open (`PresenceRegistryIT#sessions_redisDown_failOpenAndKeepOtherTabs`); ws-token issue and CONNECT fail closed (no new WebSockets) |
| Multi-instance | Not supported in v0: in-memory simple broker (room messages and user events), in-memory HTTP sessions (A-11), hourly expiry job without a lock. Presence and ws-tokens are multi-instance safe. D-11 = one Render instance (owner setting, unverified) |
| Indexes | Declared on documents and created at startup (`auto-index-creation=true`). The v0 additions are partial or on new collections (`messages_room_sender_client` partial on `clientMessageId $exists`; `membership_requests`, `user_blocks`, `reports` new), so creating them on existing production data cannot fail on legacy rows. Legacy rooms without `state` read as `ACTIVE` (`ChatRoom#getState`) |
| Pagination | History `limit` clamped 1..100 with an opaque cursor; discover and user search clamped (max 50); `GET /rooms` and `GET /rooms/{id}/members` are unbounded (V1_BACKLOG P3) |
| Errors | `ProblemDetail` for REST incl. 401/403/429 from filters (`SecurityProblemDetailIT` 4, `GlobalExceptionHandlerTest` 14); STOMP errors `{tempId, code, message}` on `/user/queue/errors` |
| Data backfill | `docs/ops/backfill-CM-028-CM-049.js` (memberCount, DM memberKey) not yet run (O-4 unchecked). CM-028 and CM-049 are already on `main`, so this gap already exists in production today |

## 6. Not verified
- **Production state**: whether secrets were rotated (A-01), what Render has set (env vars, instance count, health-check
  path), whether production has duplicate users or DMs, and the real `X-Forwarded-*` chain through Vercel to Render. No
  production calls, by rule.
- **JDK 17 build**: I ran on JDK 21 locally; CI and the image use 17. The CI workflow runs `./mvnw -B verify` on 17, but I
  did not see a CI run for this branch.
- **Full-stack smoke** (`MVP_V0_PLAN.md` CM-067 checklist): not run; it needs two OAuth accounts and a browser, and
  overlaps Reviewer B.
- **Real Mongo or Redis outage behaviour** beyond the unit and IT tests (no chaos test run).
- **Browser-route login redirect behind the proxy**: `SecurityConfig.browserLoginEntryPoint` builds an absolute URL from
  the request host. Whether that resolves to the Vercel or the Render host depends on proxy headers I could not observe.
- **Upstash compatibility** of the presence Lua script and pub/sub (BOARD CM-043 follow-up).
- **Large payload behaviour of A-02** was shown from the code, not reproduced with a running server.

## 7. Follow-ups (suggested tickets, not blockers)
- **CM-0xx Validate room settings and client message ids**: `RoomSettingsRequest`/response records with `@Size`, `@Size(max = 64)` on `tempId` (A-02, A-08).
- **CM-0xx Production deploy guide**: env var table, Render settings, optional `render.yaml` without secrets (A-03).
- **CM-0xx History 404 for non-members**: align `MessageService#getMessages` with SPEC-002 §5 (A-07).
- **CM-0xx Refresh backend README**: replace the hand-written endpoint list with links to OpenAPI and the protocol doc (A-09).
- **CM-0xx Spec citation sweep**: fix the 6 stale test citations and the AC-001-2 / D-09 index statement (A-10).
- **v1 Session store on Redis**: Spring Session plus broker relay or Redis fan-out, a prerequisite for more than one instance (A-11).
- **v1 WebSocket revocation**: close sockets on logout and session expiry, revoke outstanding ws-tokens (WS-A02..A04, ADR).
- **v1 Health groups**: decide whether a Redis outage should fail the Render health check (separate liveness and readiness).
- **Small cleanup**: unused `dto/request/JoinChatRoomRequest` (direct add was removed in CM-070); `BlockService` "Deleted user" literal (BOARD M3).

## Out of area
- Frontend (Reviewer B): `NEXT_PUBLIC_WS_URL` production value is not documented (`frontend/.env.example` has only the
  local URL); `frontend/vercel.json` hard-codes the Render host for the rewrites, so a recreated backend service needs a
  frontend change too; CM-066, CM-079 and CM-080 status on the board versus the CM-084 work; FE ACs 001-9, 004-5/7/8,
  005-6, 008-4, 008-8..11, 008-14.
