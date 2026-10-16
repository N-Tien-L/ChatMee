# V1+ backlog (deliberately out of v0)
- Status: Living list · Created: 2026-10-12 · Owner: @N-Tien-L
- Purpose: record every feature that was discussed and cut from v0, with the reason, so that v1 planning can start from here. Nothing in this list is approved.

## From SPEC-008 (MVP v0 non-goals, unchanged)
| Item | Why deferred | Source |
|---|---|---|
| Editing and deleting messages | Scope; needs history rules | SPEC-008 §2 |
| Manual ownership transfer | Auto-transfer on owner leave covers v0 (SPEC-009 AC-009-24) | SPEC-008 §2, SPEC-009 §2 |
| Presence visible only to shared-room members | Known gap (AC-005-4 open) | SPEC-008 §2 |
| "New messages" divider inside a conversation | v0 has unread counts only | SPEC-008 §2 |
| Attachments, reactions, per-message read receipts, message search | Scope | SPEC-002/004, SPEC-008 §2 |
| Group DMs | Scope | SPEC-003 §2, SPEC-008 §2 |
| Browser push notifications | Scope | SPEC-008 §2 |
| Landing page, dark mode | Scope | SPEC-008 §2 |
| Server-side revocation of open WebSockets on logout, revocation of unused ws-tokens | Known gap, listed in README (CM-003 WS-A02..A04) | SPEC-008 §2 |
| Cross-instance message fan-out | Scope | SPEC-008 §2 |
| `welcomeMessage`, `allowFileSharing`, `allowGuestUsers`, `moderationRequired` behaviour | No behaviour yet; removed from UI in v0 | SPEC-008 §2 |

## From SPEC-009 (consent, safety), cut from v0
| Item | Why deferred | Notes |
|---|---|---|
| Join requests for PRIVATE rooms + minimal invite link (token, 7-day expiry, max 50 uses) | No entry point without a link; v0 is invitation-only (D-02) | AC-009-6..8, ticket number CM-071 reserved |
| Rejoin cooldown after removal from a PUBLIC room (`room_removals`, 24 h) | Low abuse risk at v0 scale (D-03) | AC-009-26 |
| Room mute (`participants.isMuted` exists) | No push notifications yet, so mute only hides a badge (D-03) | AC-009-27 |
| Moderation console, reviewing and acting on reports | v0 only stores reports | SPEC-009 §2, AC-009-20 |
| Ban lists (ban a user from a room or the app) | Needs moderation policy | SPEC-009 §2 |
| Manual ownership transfer | See above | SPEC-009 §2 |
| Privacy: "who can message me" (everyone / people with a shared room) | Adds a setting and a second rule path | SPEC-009 §2 |
| Searchable-profile toggle | Same | SPEC-009 §2 |
| Shareable invite links with advanced rules (per-link role, revoke list) | Builds on the basic link above | SPEC-009 §9.1 |
| @mentions with their own notifications | Needs notifications | SPEC-009 §2 |
| Account deletion and data export | Legal requirements depend on the market; needs a decision | SPEC-009 §2 |

## From the 2026-10-12 reviews (decisions D-09..D-22 in MVP_V0_PLAN.md)
| Item | Source |
|---|---|
| Unique index `users(provider, providerId)` + concurrency test (check production duplicates first) | SPEC-001 AC-001-2, S-4, D-09 |
| `DELETE /api/v1/users/me` (account deletion rules for messages and rooms) | REVIEW_AUTH_USERS §5 |
| Batch user lookup `GET /users?ids=` (only if measured N+1) | REVIEW_AUTH_USERS §5, D-21 |
| User search: minimum query length, ranking by match quality | SPEC-006, D-21 |
| Room-scoped presence `GET /presence?userIds=`, per-user delivery, `ApiResponse` shape, sweep not on GET | B-2, B-7, B-8, AC-005-4, D-10 |
| Message ordering across instances (ObjectId or per-room sequence) and `after=` catch-up | B-3, B-10, D-11 |
| History endpoint: fewer reads before the page query; 404 instead of 403 for a soft-deleted room | B-4, B-5, D-13 |
| `PresenceService` lock narrowed to `localSessions`; unused `MessageRepository` queries removed | B-6, B-9, D-14 |
| Remove the dead `RedisPresencePublisher`; decide whether the 30 s `/app/presence` beat is needed | W-4, U-9, D-14 |
| Rate limiting: fail-open metric; real client IP behind Vercel (trusted header + ADR) | SPEC-007, D-22 |
| Remove the legacy `chat_rooms.lastActivity` and `participants.lastSeenAt` (`LocalDateTime`) | D-23 |
| CM-058 M1: two Mongo reads per recipient per frame (load-test, then cache or skip typing frames) | BOARD |
| React Compiler lint rules back to error (9 sites); `RedisTemplate.expire` and `getValidationGroups` deprecations | BOARD (CM-052) |
| E2E browser tests (Playwright), staging environment, load test | PROJECT_REVIEW_GUIDE §6, §9 |
| Inbound frame ordering per session (WS-A14): `setPreserveReceiveOrder(true)` swallows interceptor rejections on Spring 7.0.9; needs another approach | CM-068 report, AC-008-16 |

## Other ideas from the review (not yet specified)
- Rich DM request preview (show the first message and sender's profile) instead of plain text.
- Per-room notification levels (all, mentions only, none) beyond the single mute switch.
- Admin audit log of role changes, removals and reports.
- Reconnect replay for events (v0 refetches `GET /rooms` on reconnect; events are not replayed).
- Large-room fan-out: one `ROOM_ACTIVITY` per member is accepted for v0; measure before v1 (SPEC-008 §5).
- Membership check per STOMP frame: measure the cost and consider a short-lived cache with invalidation (review P1).
- Discover: index for the public-room search; decide whether search must be prefix-based (review P2).
- `GET /rooms` pagination for users in many rooms (review P3).
- Unify the DTO naming: `maxUsers` / `maxMembers`, `roomName` / `name` (review L3). Keep spec names until decided.
- Use `Instant` (UTC) for room timestamps (AGENTS.md §4; review M3).
- Group-room block: whether a blocked user should also be hidden inside shared public rooms.
