# CM-085 report: backend v0 readiness fixes

- Worker: `be-fix`. Branch `fix/CM-085-backend-readiness`, based on `develop` at `d8b5d58`.
- Source: `docs/plan/V0-READINESS-A-REPORT.md` (Reviewer A). This file is not committed on any branch; I read it from
  the main checkout's working tree (read only).
- Base note: the worktree started on `main` (`3cb5f89`, 65 commits behind `develop`, without SPEC-008/009). The
  branch was created from `develop` instead, because the findings and specs refer to `develop` code.

## 1. Changes per item

### Item 1: A-02 room `settings` validated
- New record `dto/request/RoomSettingsRequest` (`allowFileSharing`, `allowGuestUsers`, `moderationRequired`,
  `welcomeMessage` with `@Size(max = 500)`) and `toRoomSettings()` that maps it to the entity `ChatRoom.RoomSettings`.
- `CreateChatRoomRequest.settings` and `UpdateChatRoomRequest.settings` are now `@Valid RoomSettingsRequest`, so the
  request no longer binds the entity class. `GroupRoomPolicy.create` and `ChatRoomService.updateChatRoomById` map it.
- An oversize value is rejected by the existing `MethodArgumentNotValidException` path: 400 `ProblemDetail`,
  `code = VALIDATION_FAILED`, `errors[].field = settings.welcomeMessage`. Nothing is stored.
- JSON `null` flags still bind to `false` (the existing `fail-on-null-for-primitives=false` tests pass unchanged in
  meaning).
- **Limit: 500 characters. No limit exists in specs or design (SPEC-008 §2 only says the fields have no behaviour). Needs
  owner confirmation.** 500 matches the room description limit and Reviewer A's proposal.
- Not changed: `ChatRoomResponse.settings` still returns the entity class (see Follow-ups).

### Item 2: `tempId` bounded (A-08)
- `ChatMessageRequest.tempId` gets `@Size(max = 64)`. An oversize value goes to `/user/queue/errors` of the sending
  session with `VALIDATION_FAILED`; nothing is saved or broadcast.
- **Limit: 64 characters. `docs/design/websocket-protocol.md` specifies no length. Flagged for owner confirmation**
  (clients send UUIDs, 36 characters). The protocol doc was not edited.

### Item 3: history non-member status (A-07)
- Spec check: SPEC-002 §5 requires "Caller is not a member -> Not found, to avoid revealing the room -> 404".
  SPEC-004 §9 D-13 says "history of a soft-deleted room keeps answering 403 in v0". `error-handling.md` has no rule
  against it. So the change is permitted and required.
- `MessageService.getMessages`: unknown id -> 404 (unchanged); non-member of an active room -> 404 `ROOM_NOT_FOUND`;
  non-member of a soft-deleted room (soft delete removes all memberships) -> 403 `FORBIDDEN_ACTION`, as D-13 requires.
  The extra `findByIdAndIsActiveTrue` read runs only on the rejection path.
- `MessageControllerWebMvcTest#getRecentMessages_nonMember_returns403Problem` was replaced by
  `#getRecentMessages_nonMember_returns404Problem`, and `MessageServiceTest#getRecentMessages_nonParticipant_throwsException`
  by `#getRecentMessages_nonParticipantOfActiveRoom_throwsRoomNotFound`. Neither old name is cited in any spec.

### Item 4: A-03 environment variables
- `backend/.env.example` now lists, with placeholders only: `PORT`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`
  (marked required in dev and prod), `MONGO_URI_DEV`, and the prod set `MONGO_URI_PROD` (bound to the Boot 4 key
  `spring.mongodb.uri`, with the warning that `SPRING_DATA_MONGODB_URI` is ignored), `REDIS_URL`
  (`spring.data.redis.url`), `APP_CLIENT_URL` (`app.client.url`, CORS, WS origin, OAuth redirect URIs), plus the
  commented `SPRING_PROFILES_ACTIVE=prod` (set by the Dockerfile) and `JAVA_OPTS` (Docker entrypoint).
- Sources checked: `application.properties`, `application-dev/local/prod.properties`, `Dockerfile`,
  `docs/ops/upgrade-spring-boot-4.md`. No `@Value` without a default reads another variable. No `.env*` file other
  than the example was read.

### Item 5: `backend/README.md`
- Removed: `GET /users/provider/{provider}/id/{providerId}`, `POST /rooms/{roomId}/members`, `/app/chat.addUser`, the
  "all requests over HTTPS" line and the wrong `{status, message, data}` envelope.
- Added from the current controllers: ws-token, user search and blocks, discover, hide, read marker, member list, member
  removal, role change, cursor history, invitations, DM requests, reports, online users, `/user/queue/events`.
- Errors described as `ProblemDetail` with `code`/`errors`; success envelope as `ApiResponse {success, message, data}`.
  The README points to `/v3/api-docs`, `websocket-protocol.md` and `error-handling.md` as authoritative.

### Item 6: stale spec citations
See section 4.

## 2. Tests added or changed
| Test | Item |
|---|---|
| `ChatRoomControllerWebMvcTest#createRoom_welcomeMessageOf501Characters_returns400ValidationProblem` | 1 |
| `ChatRoomControllerWebMvcTest#createRoom_welcomeMessageOf500Characters_returnsCreated` | 1 |
| `ChatRoomControllerWebMvcTest#updateRoom_welcomeMessageOf501Characters_returns400ValidationProblem` | 1 |
| `ChatRoomControllerWebMvcTest#updateRoom_welcomeMessageOf500Characters_returnsOk` | 1 |
| `ChatWebSocketControllerValidationTest#sendMessage_tempIdOf65Characters_reportsErrorWithoutSavingOrBroadcasting` | 2 |
| `ChatWebSocketControllerValidationTest#sendMessage_tempIdOf64Characters_savesAndBroadcasts` | 2 |
| `MessageServiceTest#getRecentMessages_nonParticipantOfActiveRoom_throwsRoomNotFound` (replaces `#getRecentMessages_nonParticipant_throwsException`) | 3 |
| `MessageServiceTest#getRecentMessages_softDeletedRoom_throwsForbidden` | 3 (D-13) |
| `MessageControllerWebMvcTest#getRecentMessages_nonMember_returns404Problem` (replaces `#getRecentMessages_nonMember_returns403Problem`) | 3 |
| `MessageControllerWebMvcTest#getRecentMessages_softDeletedRoom_returns403Problem` | 3 (D-13) |

Adapted to the new type (same names, same intent): `ChatRoomControllerWebMvcTest#createRoom_nullSettingFlags_bindsFalse`,
`#updateRoom_nullSettingFlags_bindsFalse`, `ChatRoomServiceTest#createRoom_configurableRoomWithSettings_createsSuccessfully`,
`ChatRoomServiceTest#updateChatRoomById_creator_updatesSuccessfully` (matches the mapped settings instead of identity),
`PrivateRoomPolicyTest`/`PublicRoomPolicyTest#create_customSettingsAndCapacity_preservesRequest`.

## 3. Verification
- `./mvnw spotless:apply`: **not available**. The Spotless plugin is not configured in `pom.xml`
  (`NoPluginFoundForPrefixException`). No formatting step was run; code follows the surrounding style.
- `./mvnw verify` (Docker 29.8.0 running, Testcontainers): **BUILD SUCCESS**.
  - Surefire: Tests run: 577, Failures: 0, Errors: 0, Skipped: 0.
  - Failsafe: Tests run: 105, Failures: 0, Errors: 0, Skipped: 0.
  - JaCoCo: "All coverage checks have been met."
- Frontend gates not run: no frontend change.

## 4. Stale spec citations (owner to apply; Approved specs not edited)
Found by matching every `Class#method` in `docs/specs/SPEC-*.md` against `backend/src/test`. Exactly six are missing.

| Spec / AC | Stale citation | Current real test |
|---|---|---|
| SPEC-002 AC-002-5 | `ChatRoomControllerAuthorizationTest#addParticipant_adminAssigningAdmin_returnsForbidden` | `ChatRoomControllerAuthorizationTest#addParticipant_adminAssigningAdmin_returnsMethodNotAllowed` (endpoint removed in CM-070; AC superseded by AC-009-1..5) |
| SPEC-002 AC-002-5 | `ChatRoomControllerAuthorizationTest#addParticipant_nonParticipant_returnsForbidden` | `ChatRoomControllerAuthorizationTest#addParticipant_nonParticipant_returnsMethodNotAllowed` |
| SPEC-002 AC-002-5 | `ChatRoomControllerAuthorizationTest#addParticipant_ownerAssigningAdmin_returnsOk` | `ChatRoomControllerAuthorizationTest#addParticipant_ownerAssigningAdmin_returnsMethodNotAllowedWithoutMember` (also `ChatRoomControllerWebMvcTest#addParticipant_directAddRemoved_returns405WithoutAddingMember`) |
| SPEC-002 AC-002-7 | `ChatRoomServiceTest#leaveChatRoomById_creator_throwsException` | Superseded by AC-009-24 (owner may leave): `ChatRoomServiceTest#leaveChatRoomById_owner_transfersOwnershipToEarliestAdminBeforeRemovingOwnerRow`, `ChatRoomServiceTest#leaveChatRoomById_soleOwner_softDeletesRoomAndNotifiesMembers` |
| SPEC-003 AC-003-3 | `ChatRoomControllerAuthorizationTest#addParticipant_directRoom_returnsForbiddenAction` | `ChatRoomControllerAuthorizationTest#addParticipant_directRoom_returnsMethodNotAllowed` |
| SPEC-003 AC-003-1 | `ChatRoomServiceTest#createRoom_directRoom_createsSuccessfully` | `ChatRoomServiceTest#createRoom_directRoom_createsRequestedRoomWithOnlySenderAndOpensRequest` (now REQUESTED, AC-009-9) |

## 5. Items needing owner decision
1. `welcomeMessage` limit 500 characters (no spec value).
2. `tempId` limit 64 characters (no protocol-doc value). If confirmed, add it to the `/app/chat.sendMessage` row of
   `docs/design/websocket-protocol.md`.
3. History non-member is now 404 (SPEC-002 §5); soft-deleted rooms stay 403 (D-13). Confirm, and the frontend can treat
   404 on history like a removed room.
4. Apply the six citation fixes in section 4.

## 6. Follow-ups (not done, out of scope)
- `ChatRoomResponse.settings` still exposes the entity class `ChatRoom.RoomSettings` (AGENTS.md §3). A response record
  is the remaining half of A-02.
- An oversize `tempId` is echoed back in the private error (sender only, bounded by the 128 KB frame limit). It could be
  dropped from the error when it fails validation.
- Spotless is referenced in AGENTS.md §2 but not configured in `pom.xml`.
- A production deploy guide (Render health check `/actuator/health`, single instance per D-11) is still only implied;
  `.env.example` now lists the variables. Root `README.md` roadmap and WS-revocation known-gap line (A-06, A-09) are
  untouched.
- `docs/plan/V0-READINESS-A-REPORT.md` is untracked in the main checkout; commit it if it is the source of tickets.
