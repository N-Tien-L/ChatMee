# ChatMee ticket board
Updated by master. Status: todo | in-progress | review | changes-requested | merged | blocked.

| Ticket | Title | Phase | Owner | Branch | Status | Verification | Merge commit |
|---|---|---|---|---|---|---|---|
| CM-001 | Close actuator/env and rotate secrets | 0 | codex | fix/CM-001-close-actuator-env | merged (secret rotation pending: owner) | ActuatorSecurityTest 5/5, package OK | 5594152 |
| CM-002 | Patch CVE dependencies | 0 | agy2 | build/CM-002-dependency-patches | merged (2 rounds) | Boot 3.5.16, next 15.5.27, axios 1.20.0; audit prod 0 critical (1 high postcss via next, needs Next 16 / CM-052); BE tests + FE gates OK | 7cacd0e |
| CM-003 | WS token authentication (+ CM-011) | 0 | codex | feat/CM-003-ws-token-auth | merged (claude-w review pending after quota reset) | 32 WS/auth/presence tests green, package OK, FE lint/tsc/build OK | 7204e72 |
| CM-004 | WS subscribe/send authorization | 0 | codex | feat/CM-004-ws-authorization | merged (claude-w review pending after quota reset) | WS/auth/presence/typing tests green, package OK, FE lint/tsc/build OK | 39fe07f |
| CM-005 | Agent rules, templates, ADRs (a) + junk cleanup (b) | 0 | agy | docs/CM-005-agent-rules, chore/CM-005-junk-cleanup | merged | a: reviewed; b: test-compile + build OK | 765979b, 79ef0c2 |
| CM-006 | Fix typos and names | 0 | agy | refactor/CM-006-fix-typos | merged | grep 0 hits, test-compile OK, tsc OK; reviewed by master (rename-only, codex review skipped) | f010b8d |
| CM-007 | Enable Bean Validation | 0 | codex | fix/CM-007-bean-validation | merged (2 rounds) | validation tests + actuator test green, package OK | 6e820d5 |
| CM-008 | Restrict join/role rules | 0 | codex | fix/CM-008-join-role-rules | merged | mvnw verify green (ParticipantServiceTest 17, ChatRoomControllerAuthorizationTest 7) | 66d63b5 |
| CM-009 | Local environment setup (compose, .env) | 0 | agy2 | chore/CM-009-local-compose | merged (2 rounds) | compose healthy, local profile + full profile start; reviewed by master | 57bd232 |
| CM-010 | Remove sensitive logs and fix CSRF | 0 | agy2 | fix/CM-010-logs-csrf | in-progress | | |
| CM-011 | Fix presence Redis channel (minimal) | 0 | codex | feat/CM-003-ws-token-auth | merged (folded into CM-003) | PresenceEventListenerTest | 7204e72 |
| CM-012 | Fix frontend linting | 0 | agy | fix/CM-012-frontend-lint | merged | lint 0 errors/11 warnings, tsc OK, build OK; reviewed by master | 570636d |
| CM-013 | Fix frontend room switch leakage | 0 | agy | fix/CM-013-room-switch | merged (manual GIF test pending: owner) | lint/tsc/build OK; reviewed by master | 56b1be3 |
| CM-020 | Setup testing infrastructure | 1 | agy | test/CM-020-test-infra | merged | mvnw verify green (40 unit + 1 IT, contextLoads green), JaCoCo 28% lines; npm test/lint/tsc/build OK | b6fb35d |
| CM-021 | Service layer unit tests | 1 | agy | test/CM-021-service-tests, test/CM-021b-service-coverage | merged (service coverage 83.0%, JaCoCo check >=80% enforced) | mvnw verify green; reviewed by master | b5917f9, f22c978 |
| CM-022 | Controller slice tests | 1 | agy2 | | todo | | |
| CM-023 | WS/Mongo integration tests | 1 | codex | test/CM-023-ws-integration-tests | merged (ParticipantRepositoryIT moved to CM-028) | mvnw verify green; StompMessagingIT 5, ActuatorSecurityIT 3 | 97131f7 |
| CM-024 | Global exception handler (ProblemDetail) | 1 | codex | refactor/CM-024-problem-detail | merged (2 rounds) | verify green 145 unit + 12 IT, service cov 85%, JaCoCo check met; FE test/lint/tsc/build OK | 3ae42ea |
| CM-025 | Full validation constraints | 1 | codex | | todo | | |
| CM-026 | OpenAPI/Swagger setup | 1 | agy2 | | todo | | |
| CM-027 | CI setup (GitHub Actions) | 1 | agy2 | ci/CM-027-github-actions | merged | YAML parsed; reviewed by master | a40100b |
| CM-028 | Room membership data integrity | 1 | codex | | todo | | |
| CM-029 | Async message saving and timestamps | 1 | codex | fix/CM-029-persist-then-broadcast | in-progress | | |
| CM-030 | Rate limiting enhancements | 1 | codex | | todo | | |
| CM-031 | Basic frontend tests | 1 | agy | test/CM-031-frontend-tests | merged | 22 vitest tests green, lint/tsc/build OK; reviewed by master | c2f69d6 |
| CM-040 | UserPrincipal and DTO mappers | 2 | codex | | todo | | |
| CM-041 | RoomTypePolicy strategy pattern | 2 | codex | | todo | | |
| CM-042 | Resource-based API/WS routes | 2 | agy | | todo | | |
| CM-043 | Multi-instance presence | 2 | codex | | todo | | |
| CM-044 | Message pagination with cursor | 2 | codex | | todo | | |
| CM-045 | Frontend STOMP refactor | 2 | claude-w | | todo | | |
| CM-046 | Frontend UI state and a11y | 2 | agy | | todo | | |
| CM-047 | Server-side user search | 2 | agy | feat/CM-047-user-search | in-progress | | |
| CM-048 | PUBLIC room discovery | 2 | agy | | todo | | |
| CM-049 | DM unique member keys | 2 | agy | | todo | | |
| CM-050 | Professional README rewrite | 2 | agy | | todo | | |
| CM-051 | Dockerfile improvements | 2 | agy2 | chore/CM-051-dockerfile | a merged (non-root, layered jar, actuator healthcheck); b (JSON logs/MDC) todo after CM-010 | compose full: healthy, uid 100 | 4a68c62 |
| CM-052 | Major framework upgrades | 2 | agy | | todo | | |
| CM-053 | Replace SockJS with pure WebSocket | 2 | agy | | todo | | |
| CM-054 | TypeScript types cleanup | 2 | agy | | todo | | |

## Notes
- CM-011 is folded into CM-003. CM-006 already aligned the subscriber channel with the publisher ("presence-channel").
- Step 0: develop created from main at f8a2855. Worktrees: ChatMee-codex, ChatMee-agy, ChatMee-agy2.
- CM-005c: removed the empty UserProfile.tsx and UsersList.tsx (tsc + build OK).
- Follow-up for CM-045: `/user/queue/errors` is subscribed once with the first room's handler (subscribe() skips existing destinations), so delivery errors in later rooms dispatch to a stale reducer.
- Follow-ups from CM-004 (for CM-045/CM-023): a denied SUBSCRIBE closes the whole STOMP connection; existing subscriptions are not revoked when a user leaves a room.
- Follow-ups from CM-008: frontend shows Join for non-PUBLIC rooms (ChatRoomListItem.tsx:221); duplicate join still returns 500 (CM-024/CM-028); add-participant into a DIRECT_MESSAGE room is still allowed (CM-041/CM-049).
- CM-021 done. CustomOAuth2UserService still untested (could use DefaultOAuth2UserService.setRestOperations); candidate for CM-022.
- Follow-up from CM-031: frontend DTO naming drift (chatRoomId vs roomId, type vs messageType) between lib/type and lib/types (CM-054).
