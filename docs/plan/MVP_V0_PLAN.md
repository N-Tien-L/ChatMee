# ChatMee: MVP v0 plan

- Status: **Ready for implementation** (2026-10-12). Every open question from the reviews is decided below; nothing blocks Wave 1.
- Specs (all Approved): SPEC-008 (v0 scope, realtime list, members, UI), SPEC-009 (consent and safety, v0 subset), SPEC-001..007 (baseline, amended).
- Design: `docs/design/data-model.md` (MVP v0 additions, SPEC-009 section), `docs/design/websocket-protocol.md` (per-user events, private errors, v0 REST summary).
- Decision records: ADR-0004 (WS token), ADR-0005 (no transactions), ADR-0006 (membership by consent).
- Findings this plan absorbs: `docs/audit/UI_UX_AUDIT.md` (UX-n), `docs/audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md` (WS-An),
  `docs/audit/REVIEW_AUTH_USERS.md` (F-n, S-n), `docs/audit/REVIEW_MESSAGES_PRESENCE.md` (B-n, U-n), `docs/audit/REVIEW_WS_ENDPOINTS.md` (W-n).
  Every finding ID is mapped to a ticket or to v1 in "Findings triage" at the end.
- Out of scope: `docs/plan/V1_BACKLOG.md`.

## Decisions (2026-10-12, owner delegated)
Change any row before its ticket starts; later changes need a spec amendment.

| ID | Question | Decision | Effect |
|---|---|---|---|
| D-01 | Is SPEC-009 in v0? | Yes, the core: invitations, DM requests, blocking, reporting (store only), hide DM, OWNER role changes and owner auto-transfer, "Deleted user" label, daily action limits. | CM-070, CM-072..080 |
| D-02 | SPEC-009 §9.1 join-request entry point | Join requests and invite links move to v1. A PRIVATE room is entered only by invitation in v0. | AC-009-6..8 v1; ticket number CM-071 reserved for v1 |
| D-03 | Rejoin cooldown, mute | v1. No push notifications exist, so mute adds little; a removed PUBLIC member may rejoin at once. | AC-009-26/27 v1 |
| D-04 | Accepting a DM request | Explicit accept, a reply, or the recipient creating the same DM, all accept. | AC-009-9, -12 |
| D-05 | Blocked DM, timings, reports | Read-only both ways, history kept. Invitation 7 d, DM request 14 d, decline cooldown 30 d. Reports stored only, reviewed manually in v0. | SPEC-009 |
| D-06 | Hidden DM vs `ROOM_ACTIVITY` (protocol draft said "not sent") | A message after `hiddenAt` clears it and `ROOM_ACTIVITY` is sent, so the DM reappears. | AC-009-21 |
| D-07 | `/auth/status` (S-1) | Stays removed; `/auth/me` 401 is the guest check. SPEC-001 updated. | none (code already) |
| D-08 | `/auth/me` shape (S-2) | Keep nested `ApiResponse<AuthResponse>`; SPEC-001 documents it. | none (code already) |
| D-09 | Unique index `users(provider, providerId)` (S-4) | v1: creating it in production needs a duplicate check first. | V1_BACKLOG |
| D-10 | Presence scope (AC-005-4, B-2) | Global in v0 (documented gap). Initial snapshot on connect (U-1, U-8) is in v0. | CM-064, CM-065 |
| D-11 | Multi-instance (B-3, ordering, fan-out) | v0 runs **one** backend instance on Render. Ordering by `Instant.now()`, simple broker and the hourly job rely on it. | owner: Render setting |
| D-12 | Idempotency (B-1, U-2, W-1, W-2) | Client id only; key `(chatRoomId, senderId, clientMessageId)`; Resend reuses the id; broadcast failure after save is not reported as a send failure. Folded into CM-068. | CM-068 |
| D-13 | History of a soft-deleted room (B-5) | Keep 403 in v0. | v1 cleanup |
| D-14 | Cleanups B-4, B-6..B-9, U-9, W-4 | v1 (no user-visible effect). | V1_BACKLOG |
| D-15 | README `/app/presence` wording (W-3) | Fix in the release docs. | CM-067 |
| D-16 | Auth follow-ups (F-1..F-3, F-5) | One ticket after CM-063. | CM-069 |
| D-17 | Small conversation fixes (U-3..U-8) | Folded into CM-065. Cache clear on logout (U-10) in CM-069. | CM-065, CM-069 |
| D-18 | Spec status | SPEC-001, -003, -005, -006, -007, -009 Approved; ADR-0006 Accepted. | coding allowed |
| D-19 | `WsTokenServiceTest`/`AuthChannelInterceptorTest` "Tests run: 0" | Verified 2026-10-12: XML reports 6 and 21 tests, 0 failures. The `.txt` summary shows 0 because the tests are `@Nested`. | none |
| D-20 | Vercel Node version | Next 16 needs >= 20.9; CI tests 20 and 22. Set Vercel to **22.x**. | owner: Vercel setting |
| D-21 | User search min length, ranking, batch lookup | v1 (batch lookup only if measured). | V1_BACKLOG |
| D-22 | Rate-limit metric, real client IP behind Vercel | v1 (the IP fix needs an ADR). | V1_BACKLOG |
| D-23 | Read marker and activity fields | New `participants.lastReadAt` and `chat_rooms.lastActivityAt` (both `Instant`). Do **not** reuse `lastSeenAt`/`lastActivity` (`LocalDateTime`, zone-shifted, `lastActivity` also changes on membership edits). Missing `lastReadAt` = 0 unread. | CM-061, data-model |

## Lanes and order
Tickets that touch `ChatRoomService`/`ParticipantService`/`ChatRoomResponse` run **in one backend lane, in order**, to avoid conflicts.
Other lanes run in parallel. A ticket starts only when its "Depends on" tickets are merged into `develop`.

```text
BE-core  (sequential)  CM-060 -> CM-061 -> CM-062 -> CM-076 -> CM-070 -> CM-072 -> CM-075 -> CM-073 -> CM-077
BE-side  (parallel)    CM-068 (BE+FE, merge before CM-060 is rebased) ; CM-074 -> CM-078 (after CM-070, CM-072)
FE-A     (sequential)  CM-063 -> CM-069 -> CM-064 (needs 060, 061, 068) -> CM-066 (needs 062, 070, 076) -> CM-080 (needs 073, 074, 075)
FE-B     (sequential)  CM-065 (needs 062, 063) -> CM-079 (needs 064, 070, 072)
Release                CM-067 (all of the above)
```

Day-one start: CM-060, CM-063, CM-068, CM-074 in parallel.

Merge rules:
- CM-068 and CM-060 both touch `ChatWebSocketController` and `websocket-protocol.md`: merge CM-068 first, rebase CM-060.
- CM-070 removes `POST /rooms/{id}/members`; the frontend still calls it until CM-066. `develop` is not deployed before CM-067, so this gap is accepted; CM-066 must remove the call.
- Every ticket that adds an endpoint or event updates `websocket-protocol.md` (rows are pre-written there) and checks OpenAPI (`OpenApiDocsIT`).
- New error codes go into `exception/ErrorCode.java` in the ticket that first needs them: `INVITATION_NOT_FOUND` (404) and `INVITATION_NOT_PENDING` (409) in CM-070, `DM_REQUEST_PENDING` (409) in CM-072.

Done gate per ticket (AGENTS.md §2): `./mvnw verify` and `npm run lint && npx tsc --noEmit && npm test && npm run build`, one test per AC, spec AC line updated to `Implemented` with the test name.

## Owner actions (can start now, independent of code)
- [ ] O-1 Rotate Google/GitHub OAuth secrets, Atlas and Upstash passwords (pending since CM-001, AUDIT 0.2). Most important.
- [ ] O-2 Render: confirm the backend runs a single instance (D-11); check the env vars from `docs/ops/upgrade-spring-boot-4.md` ("What the owner must do on Render").
- [ ] O-3 Vercel: Node 22.x (D-20).
- [ ] O-4 Run `docs/ops/backfill-CM-028-CM-049.js` in **dry-run** against production and keep the output; `APPLY=true` only in CM-067 after an Atlas snapshot.
- [ ] O-5 Read the Decisions table; change any row before its ticket starts.
- [ ] O-6 Commit this docs set on `docs/mvp-v0-spec` and merge it into `develop` (master), so workers branch from it.

---

## CM-060: Per-user event queue
- Type: feat · Spec: SPEC-008 AC-008-1 · Design: websocket-protocol.md "Per-user events" · Priority: P0 · Estimate: M · Lane: BE-core
- Depends on: — (rebase on CM-068 if it merged first)

**Goal.** Deliver room lifecycle and activity events to each affected user on `/user/queue/events`.

**Scope.** In: envelope record and event payload records; `UserEventPublisher` (wraps `convertAndSendToUser`, one method per event type);
SUBSCRIBE allowlist = `/user/queue/events` + `/user/queue/errors` in `AuthChannelInterceptor`; publish `ROOM_ADDED` (create, PUBLIC join),
`ROOM_REMOVED` (`LEFT`, `DELETED` to every pre-delete member), `ROOM_UPDATED` (name/description/capacity), `ROOM_ACTIVITY`
(after a non-SYSTEM message is persisted, to every member, preview <= 100 chars). Uses the current `ChatRoomResponse` for `{room}`;
CM-061 adds fields. Out: frontend, unread, removal (CM-062), SPEC-009 events.

**Files.** `security/AuthChannelInterceptor.java`, `service/UserEventPublisher.java` (new), `dto/event/UserEvent.java`,
`dto/event/RoomRemovedPayload.java`, `dto/event/RoomActivityPayload.java`, `dto/event/LastMessageSummary.java` (new records),
`service/ChatRoomService.java`, `service/ParticipantService.java`, `controller/ChatWebSocketController.java` (or `MessageService` after persist),
`docs/design/websocket-protocol.md` (mark section implemented), tests.

**AC.**
- [ ] SUBSCRIBE `/user/queue/events` allowed; `/user/queue/other` denied -> `AuthChannelInterceptorTest`
- [ ] Each lifecycle action sends the right event to the right users only -> `UserEventPublisherTest`, `ChatRoomServiceTest`, `ParticipantServiceTest`
- [ ] Two STOMP clients: B receives `ROOM_ACTIVITY` for a room B is not subscribed to; non-member C receives nothing -> `UserEventsIT`
- [ ] SYSTEM messages produce no `ROOM_ACTIVITY`; logs never include preview text

## CM-061: Room activity, read marker and unread count
- Type: feat · Spec: SPEC-008 AC-008-2, AC-008-3 · Design: data-model.md "MVP v0 additions" · Priority: P0 · Estimate: M · Lane: BE-core
- Depends on: CM-060

**Goal.** The room list carries `lastActivityAt`, `lastMessage`, `unreadCount`, `myRole`, sorted by activity.

**Scope.** In: `ChatRoom.lastActivityAt` (`Instant`) + embedded `lastMessage` set with a conditional atomic `$set` after a non-SYSTEM
message insert; `Participant.lastReadAt` (`Instant`, set to now on join) as the read marker (D-23); `PUT /api/v1/rooms/{id}/members/me/read`;
unread count per data-model.md (missing marker = 0); `myRole` from the participant row; sort in `GET /rooms` (fallback `createdAt`);
fill `ROOM_ACTIVITY.lastMessage` from the same summary. Out: events (CM-060), frontend.

**Files.** `model/ChatRoom.java`, `model/Participant.java`, `repository/ChatRoomRepository.java`, `repository/MessageRepository.java`,
`repository/ParticipantRepository.java`, `service/ChatRoomService.java`, `service/MessageService.java`, `service/ParticipantService.java`,
`controller/ChatRoomController.java`, `dto/response/ChatRoomResponse.java`, `docs/design/data-model.md`, tests.

**AC.**
- [ ] Sending a message updates `lastActivityAt`/`lastMessage`; an older write never moves it back -> `MessageServiceTest`, `ChatRoomRepositoryIT`
- [ ] `unreadCount` excludes own and SYSTEM messages, resets after mark-read, is 0 for a row without `lastReadAt` -> `ChatRoomServiceTest`, `RoomUnreadIT`
- [ ] Mark-read by a non-member returns 404 -> `ChatRoomControllerWebMvcTest`
- [ ] `GET /rooms` sorted by activity, includes `myRole` -> `ChatRoomControllerWebMvcTest`

## CM-062: Member list, member removal and membership system messages
- Type: feat · Spec: SPEC-008 AC-008-5..7 · Priority: P0 · Estimate: M · Lane: BE-core
- Depends on: CM-061

**Goal.** Owners/admins manage members; everyone sees membership changes in the conversation.

**Scope.** In: `GET /api/v1/rooms/{id}/members` (`{id, name, avatarUrl, role}`, at most two queries);
`DELETE /api/v1/rooms/{id}/members/{userId}` with role rules in the room type policies (checks `role`, not `createdBy`);
`MessageService.postSystemMessage(roomId, text)` used for "X joined", "X left", "A removed B" (persisted, broadcast on `/topic/rooms/{id}`,
no unread, no activity); `ROOM_REMOVED {reason: REMOVED}` to the removed user. Out: role change (CM-076), invitations (CM-070).

**Files.** `controller/ChatRoomController.java`, `service/ParticipantService.java`, `service/ChatRoomService.java`, `service/policy/*`,
`service/MessageService.java`, `dto/response/MemberResponse.java` (new), `docs/design/websocket-protocol.md`, tests.

**AC.**
- [ ] Member list for members, 404 for others; two queries max -> `ChatRoomControllerWebMvcTest`, `ParticipantServiceTest`
- [ ] OWNER removes anyone but self; ADMIN removes MEMBER only; DM 403; unknown member 404 -> `ChatRoomControllerAuthorizationTest`
- [ ] Removed subscriber stops receiving frames and gets `ROOM_REMOVED` -> `SubscriptionRevocationIT`
- [ ] Join/leave/remove SYSTEM messages are persisted, broadcast, excluded from unread -> `ParticipantServiceTest`, `MessageRepositoryIT`

## CM-063: UI foundation and app shell
- Type: refactor · Spec: SPEC-008 AC-008-10, AC-008-11 · UX-1..4, UX-24..26 · Priority: P0 · Estimate: M · Lane: FE-A
- Depends on: —

**Goal.** One visual language and shared primitives the other frontend tickets build on.

**Scope.** In: accent token set in `globals.css` (UI_UX_AUDIT §3); `components/common/` with `UserAvatar` (initials fallback, neutral variant
for "Deleted user"), `RoomAvatar`, `UnreadBadge` (99+), `RelativeTime`, `ConfirmDialog` (on `components/ui/dialog`), `EmptyState`;
dashboard layout auth gate (no "Access Denied" flash); app header with user menu (Profile, Sign out); mobile list <-> conversation
navigation (< 768 px, Back, no drawer); login cleanup (no `href="#"`, no per-mousemove state, buttons visible at once, display fonts limited
to the wordmark). Out: sidebar rows, message list, dialog content, login redirect logic (CM-069).

**Files.** `app/globals.css`, `app/layout.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/login/page.tsx`,
`app/profile/page.tsx`, `components/LoginForm.tsx`, `components/background/LoginBackGround.tsx`, `components/common/*` (new), tests.

**AC.**
- [ ] Primitives have render tests (avatar fallback without URL, badge caps at 99+, confirm dialog focus) -> `components/common/*.test.tsx`
- [ ] No broken `/default-avatar.png`; no `href="#"`; profile reachable from the user menu
- [ ] Existing a11y tests stay green

## CM-064: Real-time sidebar
- Type: feat · Spec: SPEC-008 AC-008-4, SPEC-005 AC-005-6 · UX-5..9, U-1 · Priority: P0 · Estimate: M · Lane: FE-A
- Depends on: CM-060, CM-061, CM-063, CM-068, CM-069

**Goal.** The room list shows what is new and updates live.

**Scope.** In: subscribe `/user/queue/events` once in the realtime layer and dispatch to `chatRoomsStore` (`upsertRoom`, `removeRoom`,
`applyActivity`) for `ROOM_ADDED/REMOVED/UPDATED/ACTIVITY` (all `reason` values); unknown room -> fetch it once; on every `connected`
(first and reconnect) refetch `GET /rooms` **and** `GET /online-users` -> `chatStore.setOnlineUsers` (U-1); sort by activity; row redesign
(avatar, name, relative time, preview "You: ..." / "Alice: ...", unread badge, bold when unread, lock icon for private, "Pending" chip for
`state: REQUESTED`); mark-read when a room is opened and when a message arrives in the open room while the tab is visible; document title
"(N) ChatMee"; row menu Info / Leave (or Delete for owner); filter All / Direct; header buttons New message, New group, Discover
(dialogs come in CM-066; until then they open the existing dialogs). Out: dialog content (CM-066), conversation view (CM-065), requests inbox (CM-079).

**Files.** `lib/realtime/StompProvider.tsx`, `lib/realtime/stompSession.ts`, `lib/stores/chatRoomsStore.ts`, `lib/stores/chatStore.ts`,
`lib/api/chatRoomApi.ts`, `lib/types/*`, `components/room/ChatRoomsList.tsx`, `components/room/ChatRoomListItem.tsx`, tests.

**AC.**
- [ ] Store: event handling, ordering, unread increment rules (not for the open, visible room), upsert without duplicates -> `chatRoomsStore.test.ts`
- [ ] Row renders preview "You: ..." for own messages, badge, pending chip -> `ChatRoomListItem.test.tsx`
- [ ] Events subscription survives reconnect and resubscribes once; `GET /rooms` and `GET /online-users` refetched on reconnect -> `stompSession.test.ts`, `StompProvider.test.tsx`

## CM-065: Conversation view
- Type: feat · Spec: SPEC-008 AC-008-4, AC-008-11, SPEC-005 AC-005-5/6 · UX-10..17, U-3..U-8 · Priority: P0 · Estimate: M · Lane: FE-B
- Depends on: CM-062, CM-063

**Goal.** A conversation that reads well, handles membership changes, and fixes the known message-list bugs.

**Scope.** In: header without dead buttons, Info opens the room panel, subtitle "N members · M online" / DM "Online"/"Offline";
grouped messages (same sender within 5 min) with avatars; centred SYSTEM rows; smart auto-scroll with "New messages" button (U-3);
lucide status icons; typing names from the member list, entries expire 5 s after the last event and clear on room change (U-4);
input `maxLength` 5000 with a counter near the limit (U-5); list `key` = message id (U-6); remove the dead `sending` flag (U-7);
presence dot neutral until the first snapshot (U-8); a "Load older" button when the first page does not fill the viewport (CM-044
follow-up); ended state on `ROOM_REMOVED`/deletion with input disabled.
Out: room panel content (CM-066), request/blocked banners (CM-079, CM-080).

**Files.** `components/chat/*`, `hooks/useRoomMessage.ts`, `hooks/useWebSocket.ts`, `hooks/reducers/messageReducer.ts`, `lib/stores/chatStore.ts`, tests.

**AC.**
- [ ] Grouping and SYSTEM rendering -> `MessageList.grouping.test.tsx`
- [ ] No auto-scroll when the reader is scrolled up; button appears; own message always scrolls -> `MessageList.scroll.test.tsx`
- [ ] Typing expires after 5 s (fake timers) -> `chatStore.typing.test.ts`; counter and limit -> `MessageInput.test.tsx`
- [ ] Existing `MessageList.states`/`loadOlder` tests still green

## CM-066: Room dialogs and flows
- Type: fix · Spec: SPEC-008 AC-008-8..10, SPEC-009 AC-009-1/3/5/23/24 (UI) · UX-18..23 · Priority: P0 · Estimate: L · Lane: FE-A
- Depends on: CM-062, CM-064, CM-070, CM-076

**Goal.** Creating, messaging and managing rooms works in few clicks and never lies.

**Scope.** In: "New message" dialog (search people -> existing DM or new DM request -> open it); "New group" dialog (name, description,
Public/Private, invitees for Private sent as invitations after create, capacity under More) that opens the room; fake settings removed;
one room panel (info, members with roles, actions by `myRole`: invite, revoke pending invitation, remove, promote/demote (OWNER), leave
with "X will become the owner" confirm, delete, settings); remove the `addParticipant` call (endpoint removed by CM-070);
`ConfirmDialog` and toasts instead of `alert()`/`confirm()`; "Message" button on user search results and member rows (not for
"Deleted user"); `ROOM_FULL` message on join. Out: hide/block/report (CM-080), requests inbox (CM-079).

**Files.** `components/room/CreateRoomModal.tsx` (split into `NewMessageDialog.tsx` and `NewGroupDialog.tsx`), `components/room/RoomInfoDialog.tsx`
and `components/room/RoomSettingsDialog.tsx` (merged into `components/room/RoomPanel.tsx`), `components/room/index.ts`, `components/user/*`,
`lib/stores/chatRoomsStore.ts`, `lib/api/chatRoomApi.ts`, `lib/api/invitationApi.ts` (new: create, list for room, revoke), tests.

**AC.**
- [ ] Create group/DM navigates to the room; existing DM is not duplicated -> `chatRoomsStore.test.ts`, `NewMessageDialog.test.tsx`, `NewGroupDialog.test.tsx`
- [ ] Actions match `myRole` for OWNER/ADMIN/MEMBER, including owner leave confirm -> `RoomPanel.test.tsx`
- [ ] `grep -rn "alert(\|window.confirm(\|href=\"#\"" frontend/app frontend/components` returns nothing outside `components/ui`

## CM-067: Release v0
- Type: docs/ops · Spec: SPEC-008 AC-008-12 · W-3 · Priority: P0 · Estimate: S (+ owner time) · Lane: Release
- Depends on: every other ticket in this plan

**Steps.**
1. Update SPEC-001..009 AC lines to Implemented with test names; README features, screenshots, roadmap (link V1_BACKLOG); README security model
   adds "logout and session expiry do not close open WebSockets server-side (WS-A02..A04, v1)" and "presence is visible to every signed-in
   user (AC-005-4, v1)"; fix `/app/presence` wording in `backend/README.md` (W-3); `CHANGELOG.md` (new) with v0.1.0.
2. Full-stack local smoke (below) on `develop`, two browsers, two accounts.
3. Owner: O-1 done; Atlas snapshot; run the backfill with `APPLY=true`; env vars set (O-2, O-3).
4. Owner: merge `develop` into `main`, deploy backend and frontend together, smoke on production, tag `v0.1.0`.

**Smoke checklist.**
- [ ] Sign in with Google and GitHub; reload keeps the session; opening `/login` while signed in lands on the dashboard; sign out works
- [ ] A starts a DM with B from "New message": A sees "Waiting for B to accept" and can send one message; B sees the request live with its preview
- [ ] B accepts (or replies): both have the active DM; a second request from A is impossible; decline on another pair removes it from A's list
- [ ] Message in a room B is not viewing: B's list moves it to the top with preview and badge; title shows the count
- [ ] Opening the room clears the badge; reload keeps it cleared
- [ ] Create public room, B discovers and joins, both see "B joined"
- [ ] Private room: owner invites B, B sees the invitation live, accepts, room appears; owner removes B, B's view shows "You are no longer a member"
- [ ] Owner promotes B to admin; owner leaves; B becomes owner ("B is now the owner")
- [ ] B blocks A: A's DM sends fail with "Cannot message this user"; A cannot find B in search; B unblocks, sending works again
- [ ] B hides the DM: it leaves B's list only; a new message from A brings it back
- [ ] Report a message: 202, no visible change for anyone
- [ ] Delete room: members see "This room was deleted" and it leaves their list
- [ ] Network off/on: banner, reconnect, missed messages appear, list and presence refreshed
- [ ] Mobile width 360 px: list -> conversation -> back; dialogs usable
- [ ] Failed message (stop backend): Resend and Discard work; a Resend of a message the server already saved shows it once
- [ ] Message sent while the network drops right after SEND: after reconnect it shows once
- [ ] Two tabs of the same user: a rate-limit error shows only in the tab that sent
- [ ] Session expired (delete the session cookie): the app goes to `/login` instead of "Reconnecting..." forever

## CM-068: Realtime robustness
- Type: fix · Spec: SPEC-008 AC-008-13..16 · WS-A06..A12, A14, B-1, U-2, W-1, W-2, F-4 · Priority: P0 · Estimate: M · Lane: BE-side
- Depends on: —

**Goal.** No duplicate messages after a lost confirmation or a Resend, no endless reconnect after the session expired, errors only in the
tab that caused them, ordered frames.

**Scope.** In:
- Backend: `Message.clientMessageId` (from `tempId`), unique partial index (data-model.md), duplicate insert returns and re-broadcasts the
  stored message; `clientMessageId` in `ChatMessageResponse` and history pages.
- Backend: persist and broadcast split in `ChatWebSocketController` (W-2): broadcast failure is logged without content, no `INTERNAL_ERROR`.
- Backend: private errors to the originating session only (`ChatWebSocketController`, `WsRateLimitInterceptor`).
- Backend: `setPreserveReceiveOrder(true)`; test SUBSCRIBE then SEND pipelined; CONNECT with Redis down returns ERROR without the token;
  confirm the time-to-first-message default for a socket that never sends CONNECT and set it explicitly if absent (WS-A10).
- Frontend: Resend reuses the failed message's `tempId` (W-1); resync merges by `clientMessageId`; `getToken` 401 -> `stop()` and route to
  `/login`; jitter on the capped backoff.
- Docs: `websocket-protocol.md` (destination matrix row for errors), ADR-0004 note correcting the cookie rationale (audit §4).
Out: server-side socket revocation on logout/session expiry (WS-A02..A04, v1 with an ADR); STOMP RECEIPT.

**Files.** `model/Message.java`, `repository/MessageRepository.java`, `service/MessageService.java`, `controller/ChatWebSocketController.java`,
`security/WsRateLimitInterceptor.java`, `config/WebSocketConfig.java`, `dto/response/ChatMessageResponse.java`,
`frontend/lib/realtime/stompSession.ts`, `frontend/lib/realtime/StompProvider.tsx`, `frontend/hooks/reducers/messageReducer.ts`,
`frontend/hooks/useRoomMessage.ts`, `frontend/lib/utils/messageUtils.ts`, `docs/design/websocket-protocol.md`,
`docs/adr/0004-websocket-authentication-token.md`, tests.

**AC.**
- [ ] Same `clientMessageId` twice stores one message; concurrent duplicates store one -> `MessageServiceTest`, `MessageRepositoryIT`
- [ ] Resync after a lost echo shows the message once; Resend keeps the id; two new sends get two ids -> `messageReducer.test.ts`, `useRoomMessage.test.ts`
- [ ] Broadcast throws after save: no `INTERNAL_ERROR` to the sender -> `ChatWebSocketControllerTest`
- [ ] Two sessions of one user: only the sender's session gets the error -> `StompMessagingIT`
- [ ] SUBSCRIBE + SEND pipelined: error delivered; Redis down at CONNECT: ERROR, no token in frame or log -> `StompMessagingIT`, `AuthChannelInterceptorTest`
- [ ] 401 on ws-token stops retries and redirects; network error keeps backoff with jitter -> `stompSession.test.ts`

## CM-069: Auth flows: login redirect, reliable logout, provider cleanup
- Type: fix · Spec: SPEC-001 AC-001-4 (client), AC-001-5, AC-001-9 · F-1, F-2, F-3, F-5, U-10 · Priority: P1 · Estimate: S · Lane: FE-A
- Depends on: CM-063

**Goal.** The server decides whether the user is signed in; `/login` never dead-ends; logout only succeeds when the server agreed.

**Scope.** In: `/login` calls `/auth/me`; skeleton while pending; 200 -> `router.replace("/dashboard")`; 401 -> form; remove the "already
logged in" branch. `logout()` async: `await POST /logout`, clear state and module caches (`useRoomMessage` session cache, stores) only on
success, then navigate with a message that survives navigation; failure keeps state and shows an error toast. Remove `isAuthenticated` from
`persist.partialize`; `StompProvider` connects only after `/auth/me` succeeded. `prompt=select_account` only for Google; delete
`loginWithAccountSelection`; replace `console.error`; `?error=true` toast. Out: redirect in `proxy.ts` (it only sees the cookie), server-side
socket revocation (v1).

**Files.** `app/login/page.tsx`, `components/LoginForm.tsx`, `lib/stores/authStore.ts`, `lib/api/authApi.ts`, `lib/api/userApi.ts`,
`lib/realtime/StompProvider.tsx`, `hooks/useRoomMessage.ts` (cache reset export), tests.

**AC.**
- [ ] Valid session on `/login` -> dashboard, `/login` not in history; stale cookie -> form, no loop; pending -> neither form nor text -> `app/login/page.test.tsx`
- [ ] `POST /logout` 403 keeps state and shows an error; success clears state and caches and lands on `/login` -> `authStore.test.ts`
- [ ] Expired session on page load opens no WebSocket before `/auth/me` answers -> `StompProvider.test.tsx`
- [ ] Both providers and the error toast covered -> `LoginForm.test.tsx`

## CM-070: Invitations for private rooms (replaces direct add)
- Type: feat · Spec: SPEC-009 AC-009-1..3, AC-009-5 · Design: data-model.md `membership_requests` · Priority: P0 · Estimate: M · Lane: BE-core
- Depends on: CM-062, CM-076

**Goal.** Nobody enters a private room without accepting an invitation.

**Scope.** In: `membership_requests` collection with indexes; invite, list (mine, room's), accept (conditional transition, seat, member,
compensation), decline, revoke; `INVITATION_RECEIVED`/`INVITATION_CHANGED`/`ROOM_ADDED` events; "X joined" SYSTEM message on accept;
remove `POST /rooms/{id}/members` and the policy's add-participant path; error codes `INVITATION_NOT_FOUND`, `INVITATION_NOT_PENDING`.
Block checks are added in CM-073. Out: join requests (v1), frontend (CM-066, CM-079).

**Files.** `model/MembershipRequest.java`, `model/MembershipRequestKind.java`, `model/MembershipRequestStatus.java` (new),
`repository/MembershipRequestRepository.java` (new), `service/InvitationService.java` (new), `controller/InvitationController.java` (new),
`dto/request/CreateInvitationRequest.java`, `dto/response/InvitationResponse.java` (new), `controller/ChatRoomController.java`,
`service/ParticipantService.java`, `service/policy/*`, `service/UserEventPublisher.java`, `exception/ErrorCode.java`,
`docs/design/websocket-protocol.md`, tests.

**AC.**
- [ ] Invite rules: OWNER/ADMIN only, member 409, duplicate pending 409, full 409, PUBLIC 400 -> `InvitationServiceTest`, `InvitationControllerWebMvcTest`
- [ ] Accept: invitee only, expired/revoked/declined 409, full room keeps PENDING and 409 -> `InvitationServiceTest`
- [ ] Twenty concurrent accepts of one invitation create one membership -> `InvitationIT`
- [ ] `POST /rooms/{id}/members` returns 404/405 -> `ChatRoomControllerWebMvcTest`; events and SYSTEM message sent -> `InvitationServiceTest`

## CM-072: DM requests
- Type: feat · Spec: SPEC-009 AC-009-9..13 · Priority: P0 · Estimate: L · Lane: BE-core
- Depends on: CM-070

**Goal.** A stranger's DM is a request until the recipient accepts.

**Scope.** In: `ChatRoom.state` (`RoomState` enum, missing = ACTIVE); DM creation in `REQUESTED` with only the sender's row; same-pair rules
(existing 200, recipient-creates = accept, decline cooldown 403); one-message limit (`DM_REQUEST_PENDING`); recipient reply = accept;
`GET /api/v1/dm-requests`; accept/decline endpoints; `DM_REQUEST` rows in `membership_requests` with `pairKey`; expiry on access and an
hourly `@Scheduled` job; events `DM_REQUEST_RECEIVED`, `ROOM_ADDED` (recipient), `ROOM_UPDATED` (sender), `ROOM_REMOVED` (`DECLINED`, `EXPIRED`);
`state` in `ChatRoomResponse`. Out: block checks (CM-073), daily limit (CM-078), frontend (CM-079).

**Files.** `model/ChatRoom.java`, `model/RoomState.java` (new), `service/DirectMessageRequestService.java` (new),
`controller/DirectMessageRequestController.java` (new), `service/MembershipRequestExpiryJob.java` (new), `dto/response/DmRequestResponse.java` (new),
`service/ChatRoomService.java`, `service/MessageService.java`, `service/ParticipantService.java`, `service/policy/DirectRoomPolicy.java`,
`repository/ChatRoomRepository.java`, `repository/MembershipRequestRepository.java`, `dto/response/ChatRoomResponse.java`,
`exception/ErrorCode.java`, `docs/design/websocket-protocol.md`, tests.

**AC.**
- [ ] Create: 201 REQUESTED with one participant; same sender again 200; recipient creating = accept; cooldown 403 -> `DirectMessageRequestServiceTest`
- [ ] Sender's second message rejected with `DM_REQUEST_PENDING`; recipient reply activates the DM -> `MessageServiceTest`, `StompMessagingIT`
- [ ] Accept/decline/expiry transitions, events and `memberKey` clearing -> `DirectMessageRequestServiceTest`, `DmRequestIT`
- [ ] Recipient's `GET /rooms` excludes REQUESTED rooms; sender's includes them with `state` -> `ChatRoomServiceTest`

## CM-073: Blocking
- Type: feat · Spec: SPEC-009 AC-009-4, AC-009-15..19 · Priority: P0 · Estimate: M · Lane: BE-core
- Depends on: CM-070, CM-072, CM-075

**Goal.** A user can stop all direct contact from another user, invisibly to that user.

**Scope.** In: `user_blocks` collection; block/unblock/list endpoints; one `isBlockedEitherWay(a, b)` check used by invite, invitation accept,
DM create, DM request accept, DM send (DM rooms only); generic 403 messages; STOMP `FORBIDDEN_ACTION`; search exclusion both ways;
`blocked` flag in `ChatRoomResponse` for the blocker; DM requests from blocked users hidden. Out: frontend (CM-080).

**Files.** `model/UserBlock.java` (new), `repository/UserBlockRepository.java` (new), `service/BlockService.java` (new),
`controller/UserApiController.java`, `service/UserService.java`, `repository/UserRepository.java`, `service/InvitationService.java`,
`service/DirectMessageRequestService.java`, `service/MessageService.java`, `service/ChatRoomService.java`, `dto/response/ChatRoomResponse.java`,
`dto/response/BlockedUserResponse.java` (new), tests.

**AC.**
- [ ] Endpoints idempotent; self 400; unknown 404 -> `UserApiControllerTest`, `BlockServiceTest`
- [ ] Every blocked path returns the same 403 text, both directions -> `BlockServiceTest`, `InvitationServiceTest`, `DirectMessageRequestServiceTest`
- [ ] DM send blocked over STOMP, history still readable, unblock restores -> `StompMessagingIT`, `MessageServiceTest`
- [ ] Search excludes blocked users both ways -> `UserRepositoryIT`

## CM-074: Reports (store only)
- Type: feat · Spec: SPEC-009 AC-009-20 · Priority: P1 · Estimate: S · Lane: BE-side
- Depends on: —

**Scope.** In: `reports` collection; `POST /api/v1/reports` (202, visibility check via services, dedupe by unique index, note <= 500,
logs ids and reason only). Daily limit comes in CM-078. Out: any review UI.

**Files.** `model/Report.java`, `model/ReportTargetType.java`, `model/ReportReason.java` (new), `repository/ReportRepository.java` (new),
`service/ReportService.java` (new), `controller/ReportController.java` (new), `dto/request/CreateReportRequest.java` (new), tests.

**AC.**
- [ ] 202 for each target type the reporter can see; 404 otherwise; duplicate counted once -> `ReportServiceTest`, `ReportControllerWebMvcTest`, `ReportRepositoryIT`
- [ ] Note over 500 -> 400; logs contain no note or content -> `ReportControllerWebMvcTest`

## CM-075: Hide DMs; DELETE on DM forbidden
- Type: feat · Spec: SPEC-009 AC-009-21, AC-009-22 · Priority: P1 · Estimate: S · Lane: BE-core
- Depends on: CM-072

**Scope.** In: `Participant.hiddenAt`; `POST /api/v1/rooms/{id}/hide` (DM only, group 400); `GET /rooms` excludes hidden; `ROOM_REMOVED {HIDDEN}`
to the caller's sessions; a message after `hiddenAt` clears it and `ROOM_ACTIVITY` is sent; DELETE on a DM 403 "Use hide for direct messages".

**Files.** `model/Participant.java`, `repository/ParticipantRepository.java`, `service/ChatRoomService.java`, `service/MessageService.java`,
`service/policy/DirectRoomPolicy.java`, `controller/ChatRoomController.java`, tests.

**AC.**
- [ ] Hide removes the DM for the caller only; message brings it back -> `ChatRoomServiceTest`, `MessageServiceTest`
- [ ] Group hide 400; DM delete 403 -> `ChatRoomControllerWebMvcTest`

## CM-076: Roles, owner auto-transfer, role-based authorization
- Type: feat · Spec: SPEC-009 AC-009-23..25, SPEC-002 §10 · Priority: P0 · Estimate: M · Lane: BE-core
- Depends on: CM-062

**Scope.** In: `PATCH /api/v1/rooms/{id}/members/{userId}/role` (OWNER only, ADMIN/MEMBER); owner leave transfers OWNER (earliest ADMIN, else
earliest MEMBER) with a conditional update, sole owner leave soft-deletes; all room authorization by participant `role`, not `createdBy`;
SYSTEM messages; `ROOM_UPDATED` to the affected user.

**Files.** `controller/ChatRoomController.java`, `service/ChatRoomService.java`, `service/ParticipantService.java`, `service/policy/*`,
`repository/ParticipantRepository.java`, `dto/request/UpdateMemberRoleRequest.java` (new), tests.

**AC.**
- [ ] Role change rules (OWNER only, not self, not OWNER, non-member 404) -> `ChatRoomControllerAuthorizationTest`
- [ ] Owner leave picks the right successor; sole member deletes the room; concurrent leaves keep exactly one OWNER -> `ParticipantServiceTest`, `RoomOwnershipIT`
- [ ] An ADMIN promoted after creation can update the room; `createdBy` alone grants nothing -> `ChatRoomServiceTest`

## CM-077: "Deleted user" label
- Type: fix · Spec: SPEC-009 AC-009-28 · Priority: P2 · Estimate: S · Lane: BE-core
- Depends on: CM-062, CM-073

**Scope.** In: one fallback constant "Deleted user" replacing "Unknown User" in history, `ROOM_ACTIVITY`, member list, `counterpart`;
frontend: no "Message" action and neutral avatar for that name (the `UserAvatar` variant exists from CM-063).

**Files.** `service/MessageService.java`, `service/ChatRoomService.java`, `service/ParticipantService.java`, `frontend/components/room/RoomPanel.tsx`,
`frontend/components/chat/MessageList.tsx`, tests.

**AC.**
- [ ] Missing user renders as "Deleted user" in each response -> `MessageServiceTest`, `ChatRoomServiceTest`, `ParticipantServiceTest`

## CM-078: Daily action limits
- Type: feat · Spec: SPEC-009 AC-009-29, SPEC-007 AC-007-6 · Priority: P1 · Estimate: S · Lane: BE-side
- Depends on: CM-070, CM-072, CM-074

**Scope.** In: daily fixed-window counters in `RateLimitingService` (`action:<name>:<user>`, fail-open), configurable defaults (room 20,
invitations 50, DM requests 20, reports 10); `RateLimitExceededException` (`RATE_LIMITED`, `Retry-After` header via `GlobalExceptionHandler`);
calls in room create, invite, DM request create (new requests only), report.

**Files.** `service/RateLimitingService.java`, `exception/RateLimitExceededException.java` (new), `exception/GlobalExceptionHandler.java`,
`service/ChatRoomService.java`, `service/InvitationService.java`, `service/DirectMessageRequestService.java`, `service/ReportService.java`,
`src/main/resources/application.properties`, tests.

**AC.**
- [ ] 21st DM request in a day -> 429 with `Retry-After`; existing DM does not count -> `DirectMessageRequestServiceTest`, `RateLimitingServiceTest`
- [ ] Redis down -> allowed and WARN -> `RateLimitingServiceTest`; 429 ProblemDetail shape -> `GlobalExceptionHandlerTest`

## CM-079: Requests inbox and DM request states (frontend)
- Type: feat · Spec: SPEC-009 AC-009-2/3/9..13 (UI), SPEC-008 AC-008-8 · Priority: P0 · Estimate: M · Lane: FE-B
- Depends on: CM-064, CM-065, CM-070, CM-072

**Goal.** Users see and answer invitations and DM requests live.

**Scope.** In: `requestsStore` (invitations + DM requests, upsert by id/roomId); events `INVITATION_RECEIVED/CHANGED`, `DM_REQUEST_RECEIVED`
dispatched from the realtime layer; refetch on reconnect; header "Requests" button with count; requests panel (accept/decline each;
accept opens the room); sender's conversation in `REQUESTED` state: banner "Waiting for X to accept", input disabled after the one message,
`DM_REQUEST_PENDING` error message; `ROOM_REMOVED {DECLINED|EXPIRED}` shows a toast.

**Files.** `lib/api/invitationApi.ts` (accept, decline, list mine; file from CM-066), `lib/api/dmRequestApi.ts` (new), `lib/stores/requestsStore.ts` (new),
`lib/realtime/StompProvider.tsx`, `lib/types/*`, `components/requests/RequestsPanel.tsx` (new), `components/requests/RequestItem.tsx` (new),
`components/chat/ChatInterface.tsx`, `components/chat/MessageInput.tsx`, `app/dashboard/page.tsx`, tests.

**AC.**
- [ ] Store applies events and reconnect refetch without duplicates -> `requestsStore.test.ts`
- [ ] Accept opens the room; decline removes the item -> `RequestsPanel.test.tsx`
- [ ] Sender view: banner, one message, input disabled -> `ChatInterface.request.test.tsx`

## CM-080: Safety UI: block, report, hide
- Type: feat · Spec: SPEC-009 AC-009-15..22 (UI) · Priority: P1 · Estimate: M · Lane: FE-A
- Depends on: CM-066, CM-073, CM-074, CM-075

**Scope.** In: Block/Unblock on member rows, user search results and the DM panel; blocked users list on the profile page with Unblock;
blocked DM read-only banner (blocker: "You blocked X · Unblock"; blocked user sees the generic send error); Report dialog (reason + note)
for user, message (message hover menu) and room; Hide on DM rows and in the DM panel (no Delete for DMs); toasts for results.

**Files.** `components/safety/ReportDialog.tsx` (new), `components/safety/BlockedUsersList.tsx` (new), `lib/api/userApi.ts` (block endpoints),
`lib/api/reportApi.ts` (new), `lib/api/chatRoomApi.ts` (hide), `lib/stores/chatRoomsStore.ts`, `components/room/RoomPanel.tsx`,
`components/room/ChatRoomListItem.tsx`, `components/chat/MessageList.tsx`, `components/chat/ChatInterface.tsx`, `components/user/*`,
`app/profile/page.tsx`, tests.

**AC.**
- [ ] Block/unblock flows update the UI; blocked DM shows the banner and disables input for the blocker -> `ChatInterface.blocked.test.tsx`
- [ ] Report dialog validates the note (500) and posts the right target -> `ReportDialog.test.tsx`
- [ ] Hide removes the row; DMs never show Delete -> `ChatRoomListItem.test.tsx`

---

## Triage of the CM-003 WebSocket audit (WS-A01..A14)
Checked against the code on `develop` (d6ce0f3) on 2026-10-11 by reading, not by running probes.

| ID | Case | Status | Evidence / where |
|---|---|---|---|
| WS-A01 | Two instances consume one token | Covered | `WsTokenService.consumeToken` uses Redis `getAndDelete`; `AuthChannelInterceptorTest#preSend_reusedToken_rejectsSecondConnect` |
| WS-A02 | Token issued before logout | v1 | Token stores only userId; needs session binding (ADR) |
| WS-A03 | Logout while a client keeps its socket | v1, known gap | No HTTP session -> WS session link; frontend stops the socket on logout |
| WS-A04 | Session expiry / account lock | v1, known gap | Socket lives until disconnect; heartbeat 10 s only detects dead peers |
| WS-A05 | Removed from room with open subscription | Covered | CM-058 `RoomSubscriptionInterceptor`; `SubscriptionRevocationIT` |
| WS-A06 | Two tabs, errors to the wrong tab | v0 · CM-068 | `convertAndSendToUser` broadcasts to all sessions |
| WS-A07 | Saved but confirmation lost | v0 · CM-068 | Resync duplicates the pending copy |
| WS-A08 | Retry after timeout stores twice | v0 · CM-068 | No `clientMessageId` persistence or unique index |
| WS-A09 | Redis down at CONNECT | Test in CM-068 | Exception in `consumeToken` aborts CONNECT |
| WS-A10 | Socket opened without CONNECT | Check in CM-068 | Confirm and set time-to-first-message |
| WS-A11 | Mass reconnect | v0 · CM-068 | No jitter |
| WS-A12 | 401 on reconnect loops | v0 · CM-068 | `beforeConnect` reschedules on every error |
| WS-A13 | Token stolen before consume | Accepted | Bearer limit; WSS/HTTPS, header stripped, not logged |
| WS-A14 | SUBSCRIBE then SEND ordering | v0 · CM-068 | Inbound thread pool does not preserve order |

## Findings triage (all review IDs)
| Source | ID | Where it goes |
|---|---|---|
| UI_UX_AUDIT | UX-1..4, UX-24..26 | CM-063 (UX-26 redirect logic: CM-069) |
| UI_UX_AUDIT | UX-5..9 | CM-064 (UX-9 dialogs: CM-066) |
| UI_UX_AUDIT | UX-10..17 | CM-065 |
| UI_UX_AUDIT | UX-18..23 | CM-066 |
| REVIEW_AUTH_USERS | F-1, F-2, F-3, F-5 | CM-069 |
| REVIEW_AUTH_USERS | F-4 | CM-068 |
| REVIEW_AUTH_USERS | S-1, S-2 | Resolved in SPEC-001 (D-07, D-08) |
| REVIEW_AUTH_USERS | S-3 | No action (the review table was wrong; POST is correct) |
| REVIEW_AUTH_USERS | S-4, batch lookup, account deletion | v1 (D-09, D-21) |
| REVIEW_AUTH_USERS | `Tests run: 0` | Resolved (D-19) |
| REVIEW_MESSAGES_PRESENCE | B-1, U-2 | CM-068 |
| REVIEW_MESSAGES_PRESENCE | B-2, B-3, B-4, B-5, B-6..B-10 | v1 (D-10, D-11, D-13, D-14) |
| REVIEW_MESSAGES_PRESENCE | U-1 | CM-064 |
| REVIEW_MESSAGES_PRESENCE | U-3..U-8 | CM-065 |
| REVIEW_MESSAGES_PRESENCE | U-9 | v1 (D-14) |
| REVIEW_MESSAGES_PRESENCE | U-10 | CM-069 |
| REVIEW_MESSAGES_PRESENCE | U-11 | CM-068 (401 handling) and CM-069 |
| REVIEW_WS_ENDPOINTS | W-1, W-2 | CM-068 |
| REVIEW_WS_ENDPOINTS | W-3 | CM-067 |
| REVIEW_WS_ENDPOINTS | W-4 | v1 (D-14) |
| REVIEW_WS_ENDPOINTS | W-5 | Accepted for v0 |
| BOARD follow-ups | CM-045 errors queue stale handler | CM-068 (session-scoped errors; verify the handler dispatch) |
| BOARD follow-ups | CM-048 `ROOM_FULL` generic error | CM-066 |
| BOARD follow-ups | CM-044 page that does not fill the viewport | CM-065 (load-older button when no scroll) |
| BOARD follow-ups | CM-058 M1 per-recipient reads, React Compiler lint warnings, deprecations | v1 |

## Parked for v1
See `docs/plan/V1_BACKLOG.md`.
