# ChatMee ticket board
Updated by master. Status: todo | in-progress | review | changes-requested | merged | blocked.

| Ticket | Title | Phase | Owner | Branch | Status | Verification | Merge commit |
|---|---|---|---|---|---|---|---|
| CM-001 | Close actuator/env and rotate secrets | 0 | codex | fix/CM-001-close-actuator-env | merged (secret rotation pending: owner) | ActuatorSecurityTest 5/5, package OK | 5594152 |
| CM-002 | Patch CVE dependencies | 0 | agy2 | build/CM-002-dependency-patches | in-progress | | |
| CM-003 | WS token authentication (+ CM-011) | 0 | codex | feat/CM-003-ws-token-auth | in-progress | | |
| CM-004 | WS subscribe/send authorization | 0 | codex | | todo | | |
| CM-005 | Agent rules, templates, ADRs (a) + junk cleanup (b) | 0 | agy | docs/CM-005-agent-rules, chore/CM-005-junk-cleanup | merged | a: reviewed; b: test-compile + build OK | 765979b, 79ef0c2 |
| CM-006 | Fix typos and names | 0 | agy | refactor/CM-006-fix-typos | merged | grep 0 hits, test-compile OK, tsc OK; reviewed by master (rename-only, codex review skipped) | f010b8d |
| CM-007 | Enable Bean Validation | 0 | codex | fix/CM-007-bean-validation | merged (2 rounds) | validation tests + actuator test green, package OK | 6e820d5 |
| CM-008 | Restrict join/role rules | 0 | codex | | todo | | |
| CM-009 | Local environment setup (compose, .env) | 0 | agy2 | chore/CM-009-local-compose | merged (2 rounds) | compose healthy, local profile + full profile start; reviewed by master | 57bd232 |
| CM-010 | Remove sensitive logs and fix CSRF | 0 | agy2 | | todo | | |
| CM-011 | Fix presence Redis channel (minimal) | 0 | codex | | todo | | |
| CM-012 | Fix frontend linting | 0 | agy | fix/CM-012-frontend-lint | merged | lint 0 errors/11 warnings, tsc OK, build OK; reviewed by master | 570636d |
| CM-013 | Fix frontend room switch leakage | 0 | agy | | todo | | |
| CM-020 | Setup testing infrastructure | 1 | agy | | todo | | |
| CM-021 | Service layer unit tests | 1 | agy | | todo | | |
| CM-022 | Controller slice tests | 1 | agy2 | | todo | | |
| CM-023 | WS/Mongo integration tests | 1 | codex | | todo | | |
| CM-024 | Global exception handler (ProblemDetail) | 1 | codex | | todo | | |
| CM-025 | Full validation constraints | 1 | codex | | todo | | |
| CM-026 | OpenAPI/Swagger setup | 1 | agy2 | | todo | | |
| CM-027 | CI setup (GitHub Actions) | 1 | agy2 | | todo | | |
| CM-028 | Room membership data integrity | 1 | codex | | todo | | |
| CM-029 | Async message saving and timestamps | 1 | codex | | todo | | |
| CM-030 | Rate limiting enhancements | 1 | codex | | todo | | |
| CM-031 | Basic frontend tests | 1 | agy | | todo | | |
| CM-040 | UserPrincipal and DTO mappers | 2 | codex | | todo | | |
| CM-041 | RoomTypePolicy strategy pattern | 2 | codex | | todo | | |
| CM-042 | Resource-based API/WS routes | 2 | agy | | todo | | |
| CM-043 | Multi-instance presence | 2 | codex | | todo | | |
| CM-044 | Message pagination with cursor | 2 | codex | | todo | | |
| CM-045 | Frontend STOMP refactor | 2 | claude-w | | todo | | |
| CM-046 | Frontend UI state and a11y | 2 | agy | | todo | | |
| CM-047 | Server-side user search | 2 | agy | | todo | | |
| CM-048 | PUBLIC room discovery | 2 | agy | | todo | | |
| CM-049 | DM unique member keys | 2 | agy | | todo | | |
| CM-050 | Professional README rewrite | 2 | agy | | todo | | |
| CM-051 | Dockerfile improvements | 2 | agy | | todo | | |
| CM-052 | Major framework upgrades | 2 | agy | | todo | | |
| CM-053 | Replace SockJS with pure WebSocket | 2 | agy | | todo | | |
| CM-054 | TypeScript types cleanup | 2 | agy | | todo | | |

## Notes
- CM-011 is folded into CM-003. CM-006 already aligned the subscriber channel with the publisher ("presence-channel").
- Step 0: develop created from main at f8a2855. Worktrees: ChatMee-codex, ChatMee-agy, ChatMee-agy2.
- Untracked `.github/prompts/` and the two empty workflow files are still in the main checkout: deleting them needs the owner (D8). CM-027 must not start until they are gone.
- CM-005c: removed the empty UserProfile.tsx and UsersList.tsx (tsc + build OK).
