# ChatMee ticket board
Updated by master. Status: todo | in-progress | review | changes-requested | merged | blocked.

| Ticket | Title | Phase | Owner | Branch | Status | Verification | Merge commit |
|---|---|---|---|---|---|---|---|
| CM-001 | Close actuator/env and rotate secrets | 0 | codex | fix/CM-001-close-actuator-env | merged (secret rotation pending: owner) | ActuatorSecurityTest 5/5, package OK | 5594152 |
| CM-002 | Patch CVE dependencies | 0 | agy2 | | todo | | |
| CM-003 | WS token authentication | 0 | codex | | todo | | |
| CM-004 | WS subscribe/send authorization | 0 | codex | | todo | | |
| CM-005 | Agent rules, templates, ADRs (part a) + junk cleanup (part b) | 0 | agy / agy2 | docs/CM-005-agent-rules | in-progress (a merged) | a: docs reviewed by master | 765979b (a) |
| CM-006 | Fix typos and names | 0 | agy | refactor/CM-006-fix-typos | in-progress | | |
| CM-007 | Enable Bean Validation | 0 | codex | | todo | | |
| CM-008 | Restrict join/role rules | 0 | codex | | todo | | |
| CM-009 | Local environment setup (compose, .env) | 0 | agy2 | chore/CM-009-local-compose | in-progress | | |
| CM-010 | Remove sensitive logs and fix CSRF | 0 | agy2 | | todo | | |
| CM-011 | Fix presence Redis channel (minimal) | 0 | codex | | todo | | |
| CM-012 | Fix frontend linting | 0 | agy | | todo | | |
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
- CM-011 is folded into CM-003.
- Step 0: develop created from main at f8a2855. Worktrees: ChatMee-codex, ChatMee-agy, ChatMee-agy2.
- Untracked `.github/prompts/` and the two empty workflow files are still in the main checkout: deleting them needs the owner (D8). CM-027 must not start until they are gone.
