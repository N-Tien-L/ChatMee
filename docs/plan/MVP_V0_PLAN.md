# ChatMee: MVP v0 plan

Spec: `docs/specs/SPEC-008-mvp-v0.md` (must be **Approved** before coding) · UI findings: `docs/audit/UI_UX_AUDIT.md` (UX-n) ·
WebSocket findings: `docs/audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md` (WS-An, triaged at the end of this file).
Owner decisions 2026-10-11: message edit/delete, ownership transfer, room-scoped presence and the in-room "new messages"
divider are v1+. v0 = real-time room list with unread counts, membership management, fixed flows, unified UI.

## Waves

```text
Wave 1 (parallel)   CM-060 user events (BE)   CM-061 activity + unread (BE)   CM-062 members API (BE)   CM-063 UI foundation (FE)
                    CM-068 realtime robustness (BE+FE, small; touches stompSession and ChatWebSocketController: merge before CM-064)
Wave 2 (parallel)   CM-064 sidebar (FE, needs 060+061+063+068)   CM-065 conversation (FE, needs 062+063)
Wave 3              CM-066 dialogs and flows (FE, needs 062+064)
Wave 4              CM-067 release v0 (master + owner)
```
Backend tickets touch different services but all extend `ChatRoomResponse`/`websocket-protocol.md`: merge CM-060 first, rebase the others.
Frontend tickets are split by area to avoid file conflicts: 063 shell/primitives, 064 sidebar, 065 conversation, 066 dialogs.

---

## CM-060: Per-user event queue
- Type: feat · Spec: SPEC-008 (AC-008-1) · Design: design/websocket-protocol.md · Priority: P0 · Estimate: M
- Depends on: —

**Goal.** Deliver room lifecycle and activity events to each affected user on `/user/queue/events`.

**Scope.** In: event record types, a `UserEventPublisher` service (wraps `convertAndSendToUser`), allowlist entry in
`AuthChannelInterceptor`, publishing `ROOM_ADDED` (create, join, add), `ROOM_REMOVED` (leave, delete; remove comes in CM-062),
`ROOM_UPDATED` (update), `ROOM_ACTIVITY` (after message persist, every member, preview ≤ 100 chars). Protocol doc first.
Out: frontend, unread counts, member removal.

**Files.** `docs/design/websocket-protocol.md`, `security/AuthChannelInterceptor.java`, `service/UserEventPublisher.java` (new),
`dto/event/*` (new records), `service/ChatRoomService.java`, `service/ParticipantService.java`, `controller/ChatWebSocketController.java`, tests.

**AC.**
- [ ] SUBSCRIBE `/user/queue/events` allowed; other `/user/queue/*` still denied -> `AuthChannelInterceptorTest`
- [ ] Each lifecycle action sends the right event to the right users only -> `UserEventPublisherTest`, `ChatRoomServiceTest`
- [ ] Two STOMP clients: B receives `ROOM_ACTIVITY` for a room B is not subscribed to; non-member C receives nothing -> `UserEventsIT`
- [ ] Logs never include preview text; done gate green

## CM-061: Room activity, read marker and unread count
- Type: feat · Spec: SPEC-008 (AC-008-2, AC-008-3) · Design: design/data-model.md · Priority: P0 · Estimate: M
- Depends on: — (coordinate `ChatRoomResponse` fields with CM-060/062)

**Goal.** The room list carries `lastActivityAt`, `lastMessage`, `unreadCount`, `myRole`, sorted by activity.

**Scope.** In: `ChatRoom.lastActivityAt` + embedded `lastMessage` summary set with an atomic `$set` after a message insert;
reuse `Participant.lastSeenAt` as the read marker (document it as such); `PUT /api/v1/rooms/{id}/members/me/read`;
unread = count of messages in the room after the marker and not sent by the caller; `myRole` from the participant row;
sort in `GET /rooms`; backfill note for existing rooms (`lastActivityAt` falls back to `createdAt`, no script required).
Out: events (CM-060), frontend.

**Files.** `model/ChatRoom.java`, `model/Participant.java`, `repository/ChatRoomRepository.java`, `repository/MessageRepository.java`,
`repository/ParticipantRepository.java`, `service/ChatRoomService.java`, `service/MessageService.java`, `service/ParticipantService.java`,
`controller/ChatRoomController.java`, `dto/response/ChatRoomResponse.java`, `docs/design/data-model.md`, tests.

**AC.**
- [ ] Sending a message updates `lastActivityAt`/`lastMessage` of the room -> `MessageServiceTest`, `ChatRoomRepositoryIT`
- [ ] `unreadCount` excludes own messages and resets after mark-read -> `ChatRoomServiceTest`, `RoomUnreadIT`
- [ ] Mark-read by a non-member returns 404 -> `ChatRoomControllerWebMvcTest`
- [ ] `GET /rooms` sorted by activity, includes `myRole` -> `ChatRoomControllerWebMvcTest`; done gate green

## CM-062: Member list, member removal and membership system messages
- Type: feat · Spec: SPEC-008 (AC-008-5..7) · Priority: P0 · Estimate: M
- Depends on: CM-060 (for `ROOM_REMOVED` on removal)

**Goal.** Owners/admins manage members; everyone sees membership changes in the conversation.

**Scope.** In: `GET /api/v1/rooms/{id}/members` (`{id, name, avatarUrl, role}`, two queries max);
`DELETE /api/v1/rooms/{id}/members/{userId}` with role rules in the room type policies; persisted SYSTEM messages for join, leave,
add, remove broadcast on `/topic/rooms/{id}`; `ROOM_REMOVED{reason: REMOVED}` to the removed user.
Out: role change, ownership transfer (v1).

**Files.** `controller/ChatRoomController.java`, `service/ParticipantService.java`, `service/ChatRoomService.java`, `service/policy/*`,
`service/MessageService.java`, `dto/response/MemberResponse.java` (new), `docs/design/websocket-protocol.md`, tests.

**AC.**
- [ ] Member list for members, 404 for others -> `ChatRoomControllerWebMvcTest`
- [ ] OWNER removes anyone but self; ADMIN removes MEMBER only; DM 403; unknown member 404 -> `ChatRoomControllerAuthorizationTest`
- [ ] Removed subscriber stops receiving frames and gets `ROOM_REMOVED` -> `SubscriptionRevocationIT`
- [ ] Join/leave/add/remove SYSTEM messages are persisted and broadcast -> `ParticipantServiceTest`, `MessageRepositoryIT`; done gate green

## CM-063: UI foundation and app shell
- Type: refactor · Spec: SPEC-008 (AC-008-10, AC-008-11) · UX-1..4, UX-24..26 · Priority: P0 · Estimate: M
- Depends on: —

**Goal.** One visual language and shared primitives the other frontend tickets build on.

**Scope.** In: accent token set in `globals.css`; `components/common/` with `UserAvatar`, `RoomAvatar`, `UnreadBadge`, `RelativeTime`,
`ConfirmDialog` (built on existing `components/ui/dialog`), `EmptyState`; dashboard layout auth gate (no "Access Denied" flash);
app header with user menu (Profile, Sign out); mobile list ↔ conversation navigation; login cleanup (no `href="#"`,
no per-mousemove state, buttons visible at once, Borel/Jersey `@import` removed or limited to the wordmark).
Out: sidebar rows, message list, dialogs content.

**Files.** `app/globals.css`, `app/layout.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/login/page.tsx`,
`app/profile/page.tsx`, `components/LoginForm.tsx`, `components/common/*` (new), tests.

**AC.**
- [ ] Primitives have render tests (avatar fallback without URL, badge caps at 99+) -> `components/common/*.test.tsx`
- [ ] No broken `/default-avatar.png`; no `href="#"`; profile reachable from the user menu
- [ ] FE gate green (lint, tsc, vitest, build)

## CM-064: Real-time sidebar
- Type: feat · Spec: SPEC-008 (AC-008-4) · UX-5..9 · Priority: P0 · Estimate: M
- Depends on: CM-060, CM-061, CM-063

**Goal.** The room list shows what is new and updates live.

**Scope.** In: subscribe `/user/queue/events` once in the realtime layer and dispatch to `chatRoomsStore`
(`upsertRoom`, `removeRoom`, `applyActivity`); refetch `GET /rooms` on reconnect; sort by activity; row redesign
(avatar, name, relative time, preview, unread badge, lock icon for private); mark-read when a room is opened and when a message
arrives in the open room while the tab is visible; document title "(N) ChatMee"; row menu reduced to Info / Leave / Delete;
filter reduced to All / Direct; header buttons New message, New group, Discover.
Out: dialogs content (CM-066), conversation view (CM-065).

**Files.** `lib/realtime/*`, `lib/stores/chatRoomsStore.ts`, `lib/api/chatRoomApi.ts`, `lib/types/*`,
`components/room/ChatRoomsList.tsx`, `components/room/ChatRoomListItem.tsx`, tests.

**AC.**
- [ ] Store: event handling, ordering, unread increment rules, upsert without duplicates -> `chatRoomsStore.test.ts`
- [ ] Row renders preview "You: ..." for own messages and the badge -> `ChatRoomListItem.test.tsx`
- [ ] Events subscription survives reconnect and resubscribes once -> `stompSession.test.ts`; FE gate green

## CM-065: Conversation view
- Type: feat · Spec: SPEC-008 (AC-008-4, AC-008-11) · UX-10..17 · Priority: P0 · Estimate: M
- Depends on: CM-062, CM-063

**Goal.** A conversation that reads well and handles membership changes.

**Scope.** In: header without dead buttons, Info opens the room panel, subtitle "N members · M online" / DM "Online";
grouped messages with avatars; centered SYSTEM rows; smart auto-scroll with "New messages" button; lucide status icons;
typing names from the member list; ended state on `ROOM_REMOVED`/deletion with input disabled.
Out: room panel content (CM-066).

**Files.** `components/chat/*`, `hooks/useRoomMessage.ts`, `hooks/useWebSocket.ts`, `lib/stores/chatStore.ts`, tests.

**AC.**
- [ ] Grouping and SYSTEM rendering -> `MessageList.grouping.test.tsx`
- [ ] No auto-scroll when the reader is scrolled up; button appears -> `MessageList.scroll.test.tsx`
- [ ] Existing `MessageList.states`/`loadOlder` tests still green; FE gate green

## CM-066: Room dialogs and flows
- Type: fix · Spec: SPEC-008 (AC-008-8..10) · UX-18..23 · Priority: P0 · Estimate: M
- Depends on: CM-062, CM-064

**Goal.** Creating, messaging and managing rooms works in few clicks and never lies.

**Scope.** In: "New message" dialog (search people → existing or new DM → open it); "New group" dialog (name, description,
Public/Private, invitees, capacity under More) that opens the room; fake settings removed from the UI; one room panel
(info + members + actions by `myRole`: add, remove, leave, delete, settings); `ConfirmDialog` and toasts instead of
`alert()`/`confirm()`; "Message" button on user search results and member rows; owner Leave disabled with explanation.
Out: role changes, ownership transfer (v1).

**Files.** `components/room/CreateRoomModal.tsx` (split or replace), `components/room/RoomInfoDialog.tsx`,
`components/room/RoomSettingsDialog.tsx`, `components/user/*`, `lib/stores/chatRoomsStore.ts`, `lib/api/chatRoomApi.ts`, tests.

**AC.**
- [ ] Create group/DM navigates to the room; existing DM is not duplicated -> `chatRoomsStore.test.ts`, dialog tests
- [ ] Actions match `myRole` for OWNER/ADMIN/MEMBER -> `RoomPanel.test.tsx`
- [ ] `grep -rn "alert(\|window.confirm(\|href=\"#\"" frontend/app frontend/components` returns nothing outside `components/ui`; FE gate green

## CM-068: Realtime robustness (CM-003 audit follow-ups)
- Type: fix · Spec: SPEC-008 (AC-008-13..16) · Audit: WS-A06, A07, A08, A09, A11, A12, A14 · Priority: P0 · Estimate: M
- Depends on: —

**Goal.** Close the gaps from the CM-003 WebSocket audit that users can hit in v0: duplicate messages after a lost
confirmation, endless reconnect after the session expired, errors shown in the wrong tab, and frame ordering.

**Scope.** In:
- Backend: `Message.clientMessageId` (from the existing `tempId`), unique sparse index `{chatRoomId, senderId, clientMessageId}`,
  duplicate insert returns the stored message (re-broadcast so the sender's pending copy resolves); `clientMessageId` in
  `ChatMessageResponse` and history pages.
- Backend: private errors to the originating session only (`@SendToUser(broadcast = false)` or session-targeted headers in
  `ChatWebSocketController` and `WsRateLimitInterceptor`).
- Backend: ordered inbound processing per session (`setPreserveReceiveOrder(true)` in `WebSocketConfig`), test that SUBSCRIBE then SEND
  in one batch delivers the error; test that CONNECT with Redis down returns ERROR without the token (fail closed).
- Frontend: `getToken` 401 → `stop()` the session and route to `/login`; jitter on the capped backoff; resync merges by `clientMessageId`.
- Docs: `websocket-protocol.md` (field, error delivery scope, ordering), ADR-0004 note correcting the cookie rationale
  (cross-site cookies depend on domain/SameSite, not "never work"), as recommended in the audit §4.
Out: server-side socket revocation on logout/session expiry and token revocation (WS-A02..A04, v1 with an ADR); STOMP RECEIPT.

**Files.** `model/Message.java`, `repository/MessageRepository.java`, `service/MessageService.java`, `controller/ChatWebSocketController.java`,
`security/WsRateLimitInterceptor.java`, `config/WebSocketConfig.java`, `dto/response/ChatMessageResponse.java`,
`frontend/lib/realtime/stompSession.ts`, `frontend/lib/realtime/StompProvider.tsx`, `frontend/hooks/reducers/messageReducer.ts`,
`docs/design/websocket-protocol.md`, `docs/adr/0004-websocket-authentication-token.md`, tests.

**AC.**
- [ ] Same `clientMessageId` twice stores one message; concurrent duplicates store one -> `MessageServiceTest`, `MessageRepositoryIT`
- [ ] Resync after a lost echo shows the message once -> `messageReducer.test.ts`
- [ ] Two sessions of one user: only the sender's session gets the error -> `StompMessagingIT`
- [ ] SUBSCRIBE + SEND pipelined: error delivered; Redis down at CONNECT: ERROR, no token in frame or log -> `StompMessagingIT`, `AuthChannelInterceptorTest`
- [ ] 401 on ws-token stops retries and redirects; network error keeps backoff with jitter -> `stompSession.test.ts`; done gate green

## CM-067: Release v0
- Type: docs/ops · Spec: SPEC-008 (AC-008-12) · Priority: P0 · Estimate: S (+ owner time)
- Depends on: CM-060..066, CM-068

**Steps.**
1. Update SPEC-001..008 statuses and test names; README features, screenshots and roadmap (v1 list); README security model adds the
   known gap "logout and session expiry do not close open WebSockets server-side (WS-A02..A04, v1)"; `CHANGELOG.md` (new) with v0.1.0.
   Add a status header to `docs/audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md` pointing to the triage below.
2. Full-stack local smoke (below) on `develop`, two browsers, two accounts.
3. Owner: rotate OAuth/Atlas/Upstash secrets; run `memberCount` and `memberKey` backfills (`docs/ops/`); set env vars from the CM-052 notes.
4. Owner: merge `develop` into `main`, deploy backend and frontend together, smoke on production, tag `v0.1.0`.

**Smoke checklist.**
- [ ] Sign in with Google and GitHub; reload keeps the session; sign out works
- [ ] A starts a DM with B from "New message": B sees it appear without reload, with unread 1
- [ ] Message in a room B is not viewing: B's list moves it to the top with preview and badge; title shows the count
- [ ] Opening the room clears the badge; reload keeps it cleared
- [ ] Create public room, B discovers and joins, both see "B joined"
- [ ] Private room: owner adds B, B sees it live; owner removes B, B's view shows "You are no longer a member"
- [ ] Delete room: members see "This room was deleted" and it leaves their list
- [ ] Network off/on: banner, reconnect, missed messages appear, list refreshed
- [ ] Mobile width 360 px: list → conversation → back; dialogs usable
- [ ] Failed message (stop backend): Resend and Discard work
- [ ] Message sent while the network drops right after SEND: after reconnect it shows once
- [ ] Two tabs of the same user: a rate-limit error shows only in the tab that sent
- [ ] Session expired (delete the session cookie): the app goes to `/login` instead of "Reconnecting…" forever

## Triage of the CM-003 WebSocket audit (WS-A01..A14)
Checked against the code on `develop` (d6ce0f3) on 2026-10-11 by reading, not by running probes.

| ID | Case | Status | Evidence / where |
|---|---|---|---|
| WS-A01 | Two instances consume one token | Covered | `WsTokenService.consumeToken` uses Redis `getAndDelete` (atomic across instances); reuse test `AuthChannelInterceptorTest#preSend_reusedToken_rejectsSecondConnect` |
| WS-A02 | Token issued before logout | v1 | Token stores only userId; needs session binding (ADR) |
| WS-A03 | Logout while a client keeps its socket | v1, known gap | No HTTP session → WS session link; frontend stops the socket on logout |
| WS-A04 | Session expiry / account lock | v1, known gap | Socket lives until disconnect; heartbeat 10 s only detects dead peers |
| WS-A05 | Removed from room with open subscription | Covered | CM-058 `RoomSubscriptionInterceptor` re-checks membership per frame; `SubscriptionRevocationIT` |
| WS-A06 | Two tabs, errors to the wrong tab | v0 · CM-068 | `convertAndSendToUser` broadcasts to all sessions of the user |
| WS-A07 | Saved but confirmation lost | v0 · CM-068 | Resync exists (CM-045) but duplicates the pending copy (BOARD follow-up CM-045) |
| WS-A08 | Retry after timeout stores twice | v0 · CM-068 | No `clientMessageId` persistence or unique index |
| WS-A09 | Redis down at CONNECT | Likely covered, test in CM-068 | Exception in `consumeToken` aborts CONNECT; header removed before use |
| WS-A10 | Socket opened without CONNECT | Check in CM-068 | Confirm the framework default time-to-first-message for plain WebSocket and set it explicitly if absent |
| WS-A11 | Mass reconnect | v0 · CM-068 | Capped exponential backoff, no jitter |
| WS-A12 | 401 on reconnect loops | v0 · CM-068 | `beforeConnect` catches every `getToken` error and reschedules |
| WS-A13 | Token stolen before consume | Accepted | Bearer limit; WSS/HTTPS in prod, token header stripped, not logged (CM-051b) |
| WS-A14 | SUBSCRIBE then SEND ordering | v0 · CM-068 | Inbound channel is a thread pool; ordering not preserved today (also CM-058 review L2) |

## Follow-ups parked for v1
Message edit/delete, ownership transfer and role changes, room-scoped presence (AC-005-4), new-messages divider,
server-side WebSocket revocation on logout/session expiry and ws-token session binding (WS-A02..A04, needs an ADR), `after=` catch-up, browser notifications, dark mode, landing page, remove `RoomSettings` from the API,
cross-instance message fan-out, `ROOM_ACTIVITY` cost for very large rooms.
