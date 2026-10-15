# CM-079 Report: Requests inbox and DM request states (frontend)

- Branch: `feat/CM-079-requests-inbox` (from `fix/CM-086-frontend-readiness`, 077af5c)
- Worker: fe-b · Date: 2026-10-16
- Scope: MVP_V0_PLAN "## CM-079", SPEC-009 AC-009-1..14 (frontend side), SPEC-008 AC-008-8, Reviewer B finding B-04.

Much of the Inbox already existed (CM-084, D-16): `inboxStore`, `invitationApi`, `dmRequestApi`, `InboxDialog`, `InboxButton`,
dispatch from `StompProvider`, and the CM-086 `ROOM_REMOVED {DECLINED|EXPIRED}` toasts and ended views. Per D-16 the plan's
`requestsStore` / `RequestsPanel` / `RequestItem` are the existing `inboxStore` / `InboxDialog` / `InboxButton`; no new files were
created for them. This ticket closed the gaps below.

## AC table

| AC | Status before | Implementation | Test(s) |
| --- | --- | --- | --- |
| Plan AC 1: store applies events and reconnect refetch without duplicates | Partly met (`inboxStore.test.ts#handleUserEvent_secondDmRequestForSameRoom_upsertsByRoomId`, `#handleUserEvent_invitationReceivedThenChanged_addsThenRemoves`); reconnect refetch of the inbox untested | `inboxStore.handleUserEvent` now also drops a request on `ROOM_ADDED` for that room (accepted in another session, or by starting the same DM) | `inboxStore.test.ts#events_thenReconnectRefetch_keepOneRowPerInvitationAndRequest`, `#handleUserEvent_roomAddedForWaitingRequest_dropsTheRequest`, `StompProvider.test.tsx#connected_firstConnectAndReconnect_refetchesInboxEachTime`, `#userEvent_dmRequestReceived_reachesTheInbox` |
| Plan AC 2: accept opens the room; decline removes the item | Store side met (`inboxStore.test.ts#acceptInvitation_success_removesItRefetchesRoomsAndReturnsRoomId`, `#declineRequest_success_removesTheRequest`); no component test | none needed in the dialog | `InboxDialog.test.tsx#acceptRequest_success_closesInboxAndOpensTheRoom`, `#acceptRequest_failure_staysOnInboxWithoutNavigating`, `#declineRequest_click_callsDeclineAndRemovesTheItem`, `#acceptInvitation_success_opensTheRoom`, `#declineInvitation_click_callsDecline`, `#render_itemInFlight_disablesOnlyItsButtons`, `inboxStore.test.ts#acceptRequest_success_removesItRefetchesRoomsAndReturnsRoomId` |
| Plan AC 3 / B-04: sender view, banner, one message, input disabled | Not met (header chip only, said "them"; composer stayed sendable) | `ChatInterface` derives `requestUsed` = `state === REQUESTED` and (room has `lastMessage` or the view holds an own non-SYSTEM message that is not `failed`). When used: send button and text field disabled (`MessageInput` new optional `inputDisabled` prop), resend disabled, submit guarded, hint "Request sent. You can send more messages once X accepts." Derived state, so `ROOM_UPDATED {state: ACTIVE}` re-enables. Server `DM_REQUEST_PENDING` races keep the generic failed-message handling. `ChatHeader` chip now reads "Waiting for X to accept" | `ChatInterface.request.test.tsx#render_requestedDm_showsWaitingBannerWithCounterpartName`, `#send_requestedDmBeforeFirstMessage_allowsTheOneMessage`, `#render_requestedDmWithOwnLastMessage_disablesInputAndExplains`, `#render_requestedDmWithOwnMessageStillSending_locksBeforeTheEcho`, `#render_requestedDmWithOnlyFailedOwnMessage_keepsTheAllowance`, `#roomUpdatedActive_afterTheOneMessage_reenablesSending`, `#render_activeDmWithHistory_isNotLocked` |
| Header "Requests" button with count | Met, untested | none | `InboxButton.test.tsx#render_noItems_showsPlainLabelWithoutCount`, `#render_invitationsAndRequests_showsTheirTotalCount`, `#click_opensTheInbox` |
| AC-009-1 invite (UI) | Met by CM-066/CM-084 (`InvitePeople`, CreateRoomModal step 2) | out of this ticket (fe-a owns room info) | existing tests |
| AC-009-2/3 accept / decline invitation; `INVITATION_CHANGED` | Met (see Plan AC 1/2) | failed accept/decline now toasts the server reason and resyncs the inbox, so stale (expired, revoked, already answered) items drop; a `ROOM_FULL` invitation stays (server keeps it PENDING) | as Plan AC 1/2 |
| AC-009-9 DM creation; existing / reverse-pending returns ACTIVE; cooldown 403 | Partly met: create toasted "Message request sent" for every DM and swallowed the server reason ("Failed to create room") | `chatRoomsStore.createRoom` toasts "Message request sent" only for `state: REQUESTED`; on error shows the server's message (e.g. "Cannot message this user" for decline cooldown or block) | `chatRoomsStore.test.ts#createRoom_declineCooldownOrBlock_toastsTheServerReason`, `#createRoom_directMessageReturned{REQUESTED,ACTIVE}_requestToastOnlyWhenPending` |
| AC-009-10 one message, `DM_REQUEST_PENDING` | Server-enforced; UI missing (B-04) | see Plan AC 3 | see Plan AC 3 |
| AC-009-11 recipient list and first-message preview | Met (preview upsert by roomId) | none | `InboxDialog.test.tsx#render_dmRequestWithMessage_showsSenderAndFirstMessagePreview`, `#render_dmRequestWithoutMessage_showsWantsToMessageYou` |
| AC-009-12 accept / decline / reply; sender `ROOM_UPDATED` ACTIVE, `ROOM_REMOVED DECLINED` | Met for toast and ended view by CM-086 (`chatRoomsStore.events.test.ts#handleUserEvent_roomRemoved%s_toastsRequestOutcome`, `ChatInterface.ended.test.tsx#userEvent_roomRemoved%s_showsMatchingEndedView`) | re-enable on ACTIVE (Plan AC 3) | `ChatInterface.request.test.tsx#roomUpdatedActive_afterTheOneMessage_reenablesSending` |
| AC-009-13 expiry | Sender side met by CM-086 (EXPIRED toast and ended view). Recipient: list is server-filtered; an item that expires while shown failed silently-stale | accept/decline failure resyncs the inbox | `inboxStore.test.ts#acceptRequest_expiredOnServer_toastsReasonAndResyncsTheInbox`, `inboxStore.test.ts#handleUserEvent_roomRemoved_dropsTheExpiredRequest` (existing) |
| AC-009-14 daily DM request limit (429) | Server side; UI showed "Failed to create room" | same createRoom change: server message is shown | `chatRoomsStore.test.ts#createRoom_declineCooldownOrBlock_toastsTheServerReason` (same error path) |
| SPEC-008 AC-008-8 creating a DM opens it, no duplicate | Met (`NewMessageDialog.test.tsx#start_newPerson_createsDirectMessageWithoutRoomName`, `chatRoomsStore.events.test.ts#addRoom_roomAlreadyAddedByEvent_keepsOneRow`) | none | existing |

## Files changed

- `frontend/components/chat/ChatInterface.tsx`, `MessageInput.tsx` (new optional `inputDisabled` prop), `ChatHeader.tsx` (chip text)
- `frontend/lib/stores/inboxStore.ts`, `frontend/lib/stores/chatRoomsStore.ts` (`createRoom` only)
- Tests: `ChatInterface.request.test.tsx`, `InboxDialog.test.tsx`, `InboxButton.test.tsx` (new); `inboxStore.test.ts`,
  `chatRoomsStore.test.ts`, `StompProvider.test.tsx` (extended)

Not touched: `RoomInfoDialog.tsx`, `RoomSettingsDialog.tsx`, `ChatRoomListItem.tsx`, safety UI, backend, `components/ui/*`, specs, BOARD.

## Gates (frontend/)

- `npm run lint`: 0 errors, 11 warnings (baseline 11, no new ones)
- `npx tsc --noEmit`: pass
- `npm test`: 46 files, 296 tests passed
- `npm run build`: pass

## Follow-ups / backend gaps (not changed)

1. A recipient who declines a DM request in one tab: other tabs of the recipient get no event (protocol sends `ROOM_REMOVED DECLINED`
   to the sender only), so the request stays in the other tab's inbox until the next reconnect, inbox open, or a failed action
   (which now resyncs). A recipient-side event (for example `DM_REQUEST_CHANGED`) would be a protocol change; not invented here.
2. The `ROOM_ADDED` drop assumes the recipient-creates-same-DM path (AC-009-9) sends `ROOM_ADDED` to the recipient like the accept
   path (AC-009-12). If it does not, the reconnect/open refetch still clears it.
3. The composer lock covers the sender only; the recipient cannot open a REQUESTED room before accepting (it is not in their
   `GET /rooms`), so "reply to accept" is only reachable through the Inbox Accept button. A reply-from-preview UI is not in the plan.
4. fe-a may add a "blocked" composer condition: it should compose with `inputDisabled` / `pausedHint` in `ChatInterface`.
5. Spec status lines in SPEC-009 (frontend test names) were not edited because the spec is Approved; the owner may log these tests.
