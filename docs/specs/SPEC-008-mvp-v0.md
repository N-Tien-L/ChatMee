# SPEC-008: MVP v0 scope and release criteria
- Status: Draft
- Owner: @N-Tien-L · Created: 2026-10-11 · Related: SPEC-001..007, ADR-0004, docs/audit/UI_UX_AUDIT.md,
  docs/audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md, docs/plan/MVP_V0_PLAN.md

## 1. Goal
Ship ChatMee v0 as a chat app people can actually use, not a demo, then pause the project.
The core loop must work end to end: **sign in → find a person or room → talk → notice new messages
in other conversations → come back and reply.** Today the last two steps are missing: the client only
listens to the open room, so new messages, new DMs and membership changes elsewhere are invisible
until a reload. v0 closes that gap, fixes the broken or misleading flows found in the 2026-10-11 review,
and brings the frontend to one consistent, polished UI.

## 2. Non-goals (deferred to v1+, owner decision 2026-10-11)
- Editing and deleting messages.
- Ownership transfer (the owner still cannot leave; the UI explains why and offers Delete).
- Presence visible only to users who share a room (AC-005-4 stays open; global presence is a known gap in v0).
- A "new messages" divider inside a conversation (v0 has unread counts only).
- Everything already out of scope in SPEC-002/003/004: attachments, reactions, read receipts per message,
  bans, moderation, group DMs, message search, cross-instance message fan-out.
- Browser push notifications, landing/marketing page, dark mode.
- Server-side revocation of open WebSockets on logout or HTTP session expiry, and revocation of unused ws-tokens
  issued before logout (CM-003 audit WS-A02..A04). v0 relies on the client stopping its socket on logout; this is
  listed as a known gap in the README security model.
- The room settings `welcomeMessage`, `allowFileSharing`, `allowGuestUsers`, `moderationRequired`:
  they have no behaviour, so v0 removes them from the UI (the backend field stays until v1).

## 3. User stories
- US-1: As a user, I see my conversations ordered by latest activity, each with a last-message preview and an unread count.
- US-2: As a user, when someone messages me in another room or starts a DM with me, my list updates at once.
- US-3: As a user, I start a DM in two clicks from a person's name, and I land in the conversation.
- US-4: As an owner or admin, I see the member list with roles, add people, and remove members.
- US-5: As a member, I see in the conversation when people join, leave or are removed.
- US-6: As a user, the app looks and behaves consistently: no dead buttons, no fake settings, no browser `alert()`.

## 4. Acceptance criteria
### Real-time user events
- AC-008-1: An authenticated user may SUBSCRIBE `/user/queue/events`. The server sends there, only to the affected user:
  `ROOM_ADDED {room}` when they create, join, or are added to a room or DM;
  `ROOM_REMOVED {roomId, reason: LEFT|REMOVED|DELETED}` when they leave, are removed, or the room is deleted;
  `ROOM_UPDATED {room}` when name, description or capacity changes;
  `ROOM_ACTIVITY {roomId, lastMessage{id, senderId, senderName, preview, createdAt}}` to every member after a message is persisted.
  `preview` is at most 100 characters. Any other `/user/queue/*` subscription stays denied. -> Test: planned (CM-060)

### Room list
- AC-008-2: `GET /api/v1/rooms` returns per room `lastActivityAt`, `lastMessage` (same shape as above, or null), `unreadCount` and `myRole`;
  the list is sorted by `lastActivityAt` descending (rooms without messages use `createdAt`). -> Test: planned (CM-061)
- AC-008-3: `PUT /api/v1/rooms/{roomId}/members/me/read` sets the caller's read marker to now; afterwards `unreadCount` is 0.
  Own messages never count as unread. Non-members get 404. -> Test: planned (CM-061)
- AC-008-4: The client keeps the list live from AC-008-1: a new room appears, a removed room disappears (and if it is open, the view shows
  "You are no longer a member" / "This room was deleted"), activity moves the room to the top and increments its badge unless the room is open
  and the tab is visible. The document title shows the total unread count. -> Test: planned (CM-064)

### Membership
- AC-008-5: `GET /api/v1/rooms/{roomId}/members` returns `{id, name, avatarUrl, role}` for every member in at most two queries; non-members get 404. -> Test: planned (CM-062)
- AC-008-6: `DELETE /api/v1/rooms/{roomId}/members/{userId}`: OWNER may remove anyone but themselves; ADMIN may remove MEMBERs only;
  DMs return 403; the removed user loses access immediately (existing revocation) and gets `ROOM_REMOVED`. -> Test: planned (CM-062)
- AC-008-7: Join, leave, add and remove persist a SYSTEM message ("X joined", "X left", "A added B", "A removed B") that is broadcast on
  `/topic/rooms/{roomId}` and appears in history. -> Test: planned (CM-062)

### Flows and UI
- AC-008-8: Creating a room or DM opens it. Starting a DM that exists opens the existing one and never duplicates it in the list.
  "Message" actions exist on user search results and in the member list. -> Test: planned (CM-066)
- AC-008-9: Room actions follow `myRole` (OWNER: settings, add, remove, delete; ADMIN: add, remove members; MEMBER: leave), not `createdBy`. -> Test: planned (CM-066)
- AC-008-10: No dead controls (call/video buttons, "coming soon" text, `href="#"` links), no `alert()`/`window.confirm()`, no fake settings.
  Confirmations use a dialog, results use toasts. -> Test: planned (CM-063..066, lint/grep check)
- AC-008-11: The UI uses the design tokens from `globals.css` (no hard-coded `gray-*`/`blue-*` palette in app components), shows real
  avatars with initials fallback, groups consecutive messages by sender, renders SYSTEM messages centred, and only auto-scrolls when the
  reader is at the bottom (otherwise a "New messages" button). Layout works from 360 px width. -> Test: planned (CM-063, CM-065)

### Realtime robustness (from docs/audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md)
- AC-008-13: A message send is idempotent per `(roomId, senderId, clientMessageId)`: the server stores `clientMessageId`, a retry
  with the same id returns the stored message instead of a second one, and history responses include `clientMessageId` so the client
  merges a resynced message with its pending copy (no duplicate after a lost confirmation). -> Test: planned (CM-068, WS-A07/A08)
- AC-008-14: When `POST /api/v1/auth/ws-token` answers 401, the client stops reconnecting and goes to `/login`; network errors keep
  the capped backoff, now with jitter. -> Test: planned (CM-068, WS-A11/A12)
- AC-008-15: Private errors on `/user/queue/errors` reach only the STOMP session that sent the frame, not every tab of the user.
  `/user/queue/events` (AC-008-1) stays delivered to every session of the user. -> Test: planned (CM-068, WS-A06)
- AC-008-16: Inbound frames of one session are processed in order, so a SUBSCRIBE sent right before a SEND is registered first;
  a CONNECT while Redis is unavailable is rejected with an ERROR frame that does not contain the token. -> Test: planned (CM-068, WS-A09/A14)

### Release
- AC-008-12: v0 is released when every AC above is Implemented, the done gate passes on `develop`, the full-stack local smoke checklist in
  `docs/plan/MVP_V0_PLAN.md` passes, production secrets are rotated, production backfills ran, `main` is merged and tagged `v0.1.0`
  with a CHANGELOG entry. -> Owner sign-off (CM-067)

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| User removed while viewing the room | View shows "You are no longer a member", input disabled, room leaves the list | `ROOM_REMOVED` |
| Event arrives for a room not yet in the list | Client fetches that room (`GET /rooms/{id}`) once and inserts it | — |
| Reconnect after a drop | Client refetches `GET /rooms` (events are not replayed) | — |
| Owner tries to leave | Disabled with explanation "Delete the room or wait for ownership transfer (v1)" | 403 if called |
| ADMIN removes an ADMIN or the OWNER | Rejected | 403 |
| Remove a user who is not a member | Not found | 404 |
| Large room (1000 members) message | One `ROOM_ACTIVITY` per member; acceptable for v0, measure before v1 | — |

## 6. Security & Authorization
- `/user/queue/events` delivers only to the principal; events carry data the user is already allowed to read.
- The message preview goes only to current members (same audience as `/topic/rooms/{id}`).
- Identity always from the principal; member removal checks the actor's role server-side (policies from CM-041).
- New destination and endpoints are added to `docs/design/websocket-protocol.md`, the interceptor allowlist and OpenAPI.

## 7. Non-functional
- `GET /rooms` stays a bounded number of queries plus one unread count per room (indexed by `{chatRoomId, createdAt, _id}`).
- `lastActivityAt`/`lastMessage` are updated with an atomic `$set` after the message insert; no multi-document transaction (ADR-0005 style).
- Logs never contain the preview or message content.

## 8. Related APIs / Protocols
docs/design/websocket-protocol.md (to be extended by CM-060), docs/design/data-model.md (CM-061), OpenAPI `/v3/api-docs`.

## 9. Open questions
- Unread count for messages older than the read marker that arrive late (clock skew between instances): accepted for v0.
