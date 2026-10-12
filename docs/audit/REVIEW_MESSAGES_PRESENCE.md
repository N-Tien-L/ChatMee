# Messages & Presence: review findings and follow-up tickets

- Scope: `GET /api/v1/rooms/{roomId}/messages`, `GET /api/v1/online-users`, and the frontend flows that use them (history, send, resend, presence dot, typing).
- Source: review session of 2026-10-12 (backend read + targeted unit tests, frontend read-only). Specs: SPEC-004, SPEC-005, SPEC-008; design: `data-model.md`, `websocket-protocol.md`; ADR-0002.
- Status: **Triaged 2026-10-12.** Every finding is mapped in `docs/plan/MVP_V0_PLAN.md` ("Findings triage"); section 4 decisions are D-10..D-14 there. CM-TBD-1 -> CM-064, CM-TBD-2 -> CM-068, CM-TBD-3/4/5/7 -> CM-065 (U-10 -> CM-069), CM-TBD-6/8/9/10 -> v1. No code was changed by this review.
- Per `AGENTS.md`, this document does not edit any Approved spec. Spec conflicts are listed as decisions for the owner (section 4).

## 1. Verification summary

| Area | Result | Evidence |
|---|---|---|
| History endpoint (cursor, limit clamp, 400 on bad cursor, 403/404, sender batch lookup) | Correct, matches `data-model.md` | `MessageControllerWebMvcTest` (8), `MessageServiceTest` (14) pass |
| `GET /online-users` + presence registry | Correct, matches SPEC-005 AC-005-1..3 | `PresenceRestControllerTest`, `PresenceServiceTest` (6), `PresenceEventListenerTest` (4) pass |
| Redis Lua registry, timestamp-tie cursor, compound index | Not executed | `PresenceRegistryIT`, `MessageRepositoryIT` need Docker; run `./mvnw verify` before relying on them |
| Frontend | Read only | `npm test`, lint, tsc, build and the browser were not run |

Design strengths worth keeping: `(createdAt, _id)` cursor with `limit+1` and a matching compound index; atomic Lua presence with per-instance leases and a 10 s grace; fail-open when Redis is down; optimistic send with timeout, Resend and Discard; resync by id after reconnect; prepend scroll anchoring with a single in-flight load-older.

## 2. Findings

### Backend

| ID | Severity | Location | Finding |
|---|---|---|---|
| B-1 | High | `MessageService.sendMessage` (`:42-59`), `ChatMessageRequest.tempId` | No idempotency. `tempId` is only echoed back, never stored. A retry after a lost confirmation (timeout, Resend) saves the message twice. Needs a stored client id with a unique index `(chatRoomId, senderId, clientMessageId)`. SPEC_DRIVEN_SETUP AC-004-3 already names `clientMessageId`. |
| B-2 | High | `PresenceRestController`, `RedisPresenceSubscriber` (`/topic/presence`) | Any authenticated user gets every online user id, and the topic is global. This is the known open AC-005-4. It is also a scaling problem: the Lua read walks the whole `online` set on every call. |
| B-3 | Medium | `MessageService.sendMessage` | Ordering relies on app-side `Instant.now()` and a random `UUID` id. With several instances, clock skew can reorder messages; within one millisecond the order is arbitrary. Fine for one instance. Needs a decision before cross-instance fan-out (ObjectId or per-room sequence). |
| B-4 | Medium | `MessageService.getMessages` (`:66-74`) | About four reads before the page query: `users.findById`, `rooms.existsById`, then `isUserParticipant` (active-room read + participant read). The principal is already authenticated, so the user lookup is redundant, and the room checks can be one read. |
| B-5 | Low | `MessageService.getMessages` | A soft-deleted room passes `existsById`, then fails `isUserParticipant`, so the caller gets 403 instead of 404. Align with the 404 the other room endpoints return (data-model says 404/403 unchanged, so confirm intent first). |
| B-6 | Low | `PresenceService` | Every method is `synchronized` and holds the lock during the Redis call. A slow Redis queues all reads of `/online-users`. Narrow the lock to `localSessions`. |
| B-7 | Low | `PresenceService.getOnlineUsers` via `read` | A `GET` also runs the sweep (removes dead sessions, may publish offline). Allowed by design, but surprising; the timer sweep should be the primary path. |
| B-8 | Low | `PresenceRestController` | Returns a bare `Set<String>`, not `ApiResponse`. Adding fields later (for example `lastSeen`) would break the contract. Decide before changing AC-005-4 to `GET /presence?userIds=`. |
| B-9 | Low | `MessageRepository` | Unused derived queries remain (`findByChatRoomIdOrderByCreatedAtAsc` is unbounded, `findTop50...`, `findByChatRoomIdAndCreatedAtAfter...`). Remove to prevent accidental use. |
| B-10 | Info | History vs reconnect | No `after=` catch-up. A gap longer than one page (50) after a disconnect leaves a hole between the old and new pages. Known in `data-model.md`; revisit with B-3. |

### Frontend

| ID | Severity | Location | Finding |
|---|---|---|---|
| U-1 | High | `lib/stores/chatStore.ts:25` (`setOnlineUsers`), `StompProvider.tsx` | The app never calls `GET /online-users`. `setOnlineUsers` has no caller. `onlineUsers` starts empty and only changes from `/topic/presence` events. Users who were already online show as offline (grey dot, wrong `onlineCount` in `ChatInterface.tsx:173`), and events missed during a disconnect are never recovered. |
| U-2 | High | Same as B-1 | Resend after a timeout can create a duplicate message when the server did save the first one and no reconnect happens to resync it. |
| U-3 | Medium | `MessageList.tsx` (`useLayoutEffect`) | The list scrolls to the bottom whenever the last message changes, even when the user is reading older messages. Standard behaviour: auto-scroll only when near the bottom, otherwise show a "New messages" button. |
| U-4 | Medium | `chatStore.updateTyping`, `TypingIndicator` | Typing has no expiry on the receiver. If `typing:false` never arrives (sender lost network or closed the tab) the indicator stays. SPEC-005 AC-005-5 says the client clears it after 5 s without events. |
| U-5 | Medium | `MessageInput.tsx` | No `maxLength` or counter, while the server accepts 1-5000 characters after trim. The user learns about the limit only from a failed send. |
| U-6 | Low | `MessageList.tsx:204` | `key` is `${message.id}-${index}`. The index makes React remount rows when older messages are prepended. Use the id alone. |
| U-7 | Low | `messageReducer.ts`, `MessageInput.tsx` | `sending` is set to `false` in every branch, so the spinner in the send button never shows. Remove it or wire it. |
| U-8 | Low | `MessageList.tsx` online dot | Grey means both "offline" and "unknown yet" (see U-1). Distinguish them or hide the dot until presence is loaded. |
| U-9 | Low | `StompProvider.tsx:45-50` | The client publishes `/app/presence {online:true}` every 30 s from every tab, against a server limit of 20 per minute per user. Confirm the backend needs this beat (`PresenceService.heartbeat` only refreshes known sessions). |
| U-10 | Low | `useRoomMessage.ts` (`sessionCache`) | Module-level cache is not visibly cleared on logout or user change. Needs confirmation in `authStore.logout` (not read in this review). |
| U-11 | Info | Whole app | Session expiry during use: no redirect flow was found in the files read (axios interceptor and `authStore` were not read). Cross-check with F-1/F-2/F-4 in `REVIEW_AUTH_USERS.md`. |

## 3. Proposed tickets

Each ticket stays small, as `AGENTS.md` requires. Numbers are placeholders.

| Ticket | Title | Findings | Priority | Needs spec/ADR change |
|---|---|---|---|---|
| CM-TBD-1 | Load initial presence snapshot on connect and reconnect | U-1, U-8 | P0 | No (SPEC-005 AC-005-1 already implies it) |
| CM-TBD-2 | Idempotent send with a stored `clientMessageId` | B-1, U-2 | P0 | Yes: SPEC-004 wording and `websocket-protocol.md` payload; unique index in `data-model.md` |
| CM-TBD-3 | Receiver-side typing expiry (5 s) | U-4 | P1 | No (AC-005-5 already says it) |
| CM-TBD-4 | Smart auto-scroll and "New messages" button | U-3 | P1 | No |
| CM-TBD-5 | Message length limit in the input (counter, `maxLength`) | U-5 | P1 | No (AC-004-3 has 1-5000) |
| CM-TBD-6 | History endpoint: fewer reads before the page query | B-4, B-5 | P2 | Only if the 403/404 behaviour changes |
| CM-TBD-7 | Frontend cleanups: list key, dead `sending`, presence beat, cache clear on logout | U-6, U-7, U-9, U-10 | P2 | No |
| CM-TBD-8 | Backend cleanups: unused repository queries, narrower `PresenceService` lock | B-6, B-9 | P2 | No |
| CM-TBD-9 | Presence scoped to shared rooms (`GET /presence?userIds=`, per-user delivery) | B-2, B-7, B-8 | P3 (v1) | Yes: AC-005-4 open question, response shape, ADR for per-user delivery |
| CM-TBD-10 | Message ordering and catch-up (`after=` or per-room sequence) | B-3, B-10 | P3 (v1) | Yes: design + ADR; do together with cross-instance fan-out |

Suggested order for the v0 completion round: CM-TBD-1, CM-TBD-2, CM-TBD-3, CM-TBD-4, CM-TBD-5, then P2 cleanups. P3 items stay in `V1_BACKLOG.md` (presence visibility is already listed there; ordering and catch-up are not).

### Acceptance criteria sketches

- **CM-TBD-1:** after the session reaches `connected` (first connect and every reconnect) the client fetches `GET /api/v1/online-users` once and calls `setOnlineUsers`; a user who was online before page load shows green; the dot is neutral until the first snapshot arrives; a failed fetch keeps the previous set and retries on the next reconnect. Tests: store/provider test with a mocked API, `MessageList` dot states.
- **CM-TBD-2:** the client sends a stable id per attempt group; the server rejects or returns the existing message for a repeated `(roomId, senderId, clientMessageId)` without a second insert; Resend reuses the id of the failed attempt; the confirmation carries the saved message so the client replaces the pending copy. Tests: service test for the duplicate path, `*IT` for the unique index, reducer test for resend with the same id.
- **CM-TBD-3:** a typing entry expires 5 s after its last event; leaving the room clears its entries; tests with fake timers.
- **CM-TBD-4:** if the user is within a threshold of the bottom the list follows new messages; otherwise it keeps the position and shows a button with a count; sending your own message always scrolls to the bottom.
- **CM-TBD-5:** the input stops at the limit (or shows a counter and disables send when over it); the limit constant is shared with the server value.

## 4. Decisions for the owner

1. **Idempotency scope (CM-TBD-2):** is a client-generated id per message enough, or should the server also dedupe by content within a short window? Recommended: client id only.
2. **AC-005-4 (CM-TBD-9):** keep presence global for v0 (current, documented gap) or scope it now? Scoping needs per-user delivery instead of `/topic/presence`. Recommended: keep global in v0, take CM-TBD-1 now, schedule CM-TBD-9 for v1.
3. **Soft-deleted room on history (B-5):** 404 or 403? Specs say 404/403 retained, so changing it needs your call.
4. **Clock and id strategy (B-3):** acceptable to stay on a single backend instance for v0 and decide ordering together with cross-instance fan-out in v1?
5. **Presence beat (U-9):** if the server does not need the 30 s client beat, remove it or keep it as the only keepalive? Needs a read of `PresenceWebSocketController` and the STOMP heartbeat settings.

## 5. Not verified in this review

- `MessageRepositoryIT` and `PresenceRegistryIT` were not run (Docker needed).
- No frontend gates (`npm test`, lint, `tsc`, `build`) and no browser session.
- Not read: `authStore.logout`, the axios response interceptor, `ChatHeader`, `stompSession.ts` internals, `PresenceWebSocketController`. U-9, U-10 and U-11 depend on them.
- Surefire showed `Tests run: 0` for `AuthChannelInterceptorTest` and `WsTokenServiceTest` (see `REVIEW_AUTH_USERS.md` section 1); not repeated here.
