# CM-066 Room dialogs and flows: report

Worker: `fe-a`. Branch: `feat/CM-066-room-dialogs`, from `fix/CM-086-frontend-readiness` (`077af5c`, which contains CM-084 and CM-086).
Scope: `docs/plan/MVP_V0_PLAN.md` "CM-066", BOARD.md M3 notes, and Reviewer B findings B-02 and B-05
(`docs/plan/V0-READINESS-B-REPORT.md`, untracked in the main checkout).

## What already existed (CM-084, CM-086)
- New message dialog (`NewMessageDialog.tsx`) and the two-step New room dialog (`CreateRoomModal.tsx`: details, then invitations for
  Private rooms, then the dialog opens the room). Unsupported settings were already removed (B-03, CM-086).
- `ROOM_FULL` on join from Discover (`discoverRoomsStore`), `ConfirmDialog`, `react-hot-toast`, `InvitePeopleDialog` (invite, list pending,
  revoke), `invitationApi` (create, list for room, revoke).
- I did not rename `CreateRoomModal` to `NewGroupDialog`. The plan names that split, but the component already is the group flow, and a
  rename would only add churn for the other lane.

## Changes
- `components/room/RoomPanel.tsx` (new): one panel that replaces `RoomInfoDialog.tsx` and `RoomSettingsDialog.tsx` (both deleted). It uses a
  desktop Dialog and a mobile Sheet.
  - Members come from the batched `GET /rooms/{id}/members` with roles. Every member is listed, with no cap of 10 and no `/users/{id}` calls.
    A member whose name is missing shows as "Deleted user" and stays in the list (BOARD M3 note).
  - Owner/Admin badges come from the participant role. Settings, invite, delete and the row actions come from `myRole`: the live store
    value refreshed by `ROOM_UPDATED`, then the fetched room, then the caller's member row. `createdBy` is never used (B-02, AC-009-25).
  - Row actions: Message (not for yourself, not for "Deleted user", not in DMs); Make admin / Make member (OWNER only, never on self or
    the owner); Remove (OWNER: anyone but self; ADMIN: MEMBERs only), with a confirmation dialog. Each result is a toast.
  - Settings view (OWNER or ADMIN): name, description and maximum members. Saving shows a toast, with no `alert()`. Delete room is
    OWNER only and asks in a `ConfirmDialog` instead of `window.prompt()` (B-05).
  - The "Removing members and changing roles come in a later update" copy is gone.
  - Join (a non-member viewing the room) shows "This room is full." for `ROOM_FULL`.
- `components/room/LeaveRoomConfirm.tsx` (new): the leave confirmation. When the owner leaves, it names the next owner ("Ana will become
  the owner."). The next owner is the first ADMIN, else the first MEMBER, or "You are the only member, so leaving deletes the room."
  (SPEC-008 §5, AC-009-24). The panel and the room list row both use it. The row loads members only when the owner opens the confirmation.
- `components/room/roomPermissions.ts` (new): pure role rules (edit, delete, invite, remove, change role, successor).
- `components/room/ChatRoomListItem.tsx`: the menu follows `myRole` with no `createdBy` fallback. The owner can now Leave (auto-transfer).
  Delete is shown for OWNER only. Info opens `RoomPanel`.
- `components/chat/ChatInterface.tsx`: renders `RoomPanel` in place of the two dialogs. The `isOwner`/`createdBy` gate is removed. This is a
  small, isolated hunk (imports and the dialog block only).
- `lib/stores/chatRoomsStore.ts`: `startDirectMessage(userId)` returns the listed DM with that person, so it is never duplicated, or creates
  a DM request. `NewMessageDialog` and the member-row Message action both use it.
- `lib/api/chatRoomApi.ts`: removed `addParticipant` (endpoint removed by CM-070) and the unused `JoinChatRoomRequest` type. Added
  `removeMember` (`DELETE /rooms/{id}/members/{userId}`) and `changeMemberRole` (`PATCH .../role`).

## AC -> implementation -> test
| AC | Implementation | Test |
|---|---|---|
| Create group/DM navigates to the room; an existing DM is not duplicated (AC-008-8) | `startDirectMessage`, `NewMessageDialog`, `CreateRoomModal` (existing) | `chatRoomsStore.test.ts#startDirectMessage_existingDm_returnsItWithoutCreatingAnother`, `#startDirectMessage_newPerson_createsDmRequestAndListsItOnce`; `NewMessageDialog.test.tsx#start_existingConversation_opensItWithoutCreating`, `#start_newPerson_navigatesToCreatedDirectMessage`, `#start_newPerson_createsDirectMessageWithoutRoomName`; `CreateRoomModal.test.tsx#create_publicRoom_sendsOnlySupportedOptions` |
| "Message" on search results and member rows (AC-008-8) | `UserSearchList actionLabel="Message"` (existing), RoomPanel row | `RoomPanel.test.tsx#message_memberRow_opensDirectMessageWithThatMember`, `#render_memberWithoutName_showsDeletedUserWithNeutralAvatar` (no Message for Deleted user) |
| Actions match `myRole` OWNER/ADMIN/MEMBER, not `createdBy` (AC-008-9, AC-009-23/25, B-02) | `RoomPanel`, `roomPermissions`, `ChatRoomListItem` | `RoomPanel.test.tsx#render_ownershipTransferred_ownerBadgeAndSettingsFollowRoleNotCreatedBy`, `#render_creatorWhoIsNoLongerOwner_getsNoSettingsEntry`, `#render_owner_canChangeRolesAndRemoveEveryoneButSelf`, `#render_admin_removesMembersOnlyAndCannotChangeRoles`, `#render_member_hasMessageAndLeaveOnly`, `#removeMember_confirmed_callsApiAndShowsToast`, `#changeRole_ownerPromotesMember_sendsAdminRole`, `#leave_confirmed_callsStoreLeaveAndCloses`; `roomPermissions.test.ts` (4); `ChatRoomListItem.test.tsx#menu_ownerByRole_offersLeaveAndDelete`, `#menu_creatorWhoIsNowAdmin_offersLeaveButNoDelete`, `#menu_member_offersLeaveOnly` |
| Owner leave confirm names the next owner (SPEC-008 §5, AC-009-24) | `LeaveRoomConfirm`, `findSuccessor` | `RoomPanel.test.tsx#leave_owner_confirmNamesTheEarliestAdminAsNextOwner`; `roomPermissions.test.ts#findSuccessor_adminsAndMembers_picksFirstAdminThenFirstMember` |
| All members from the batched endpoint, Deleted user kept (B-02, BOARD note) | `RoomPanel` | `RoomPanel.test.tsx#render_twelveMembers_listsAllFromBatchedMembersEndpoint`, `#render_memberWithoutName_showsDeletedUserWithNeutralAvatar` |
| No `alert()`/`window.confirm()`/`window.prompt()`/`href="#"`; dialogs and toasts (AC-008-10, B-05) | RoomPanel settings and delete | `components/noNativeDialogs.test.ts#sources_appAndComponents_containNoAlertConfirmPromptOrHashLinks`; `RoomPanel.test.tsx#save_settings_usesToastAndNoNativeAlert`, `#delete_owner_asksInConfirmDialogWithoutPrompt` |
| `ROOM_FULL` message on join | RoomPanel join; Discover (existing) | `RoomPanel.test.tsx#join_roomFull_showsRoomFullMessage`; existing Discover tests |
| Panel loading/error states (ported from the deleted dialogs) | RoomPanel | `states.test.tsx` "RoomPanel states" (3) |

The grep from the AC (`grep -rn "alert(\|window.confirm(\|href=\"#\"" frontend/app frontend/components`, outside `components/ui`) returns nothing.

## Gates (frontend/)
- `npm run lint`: 0 errors, 10 warnings (baseline 11; the removed dialogs had one).
- `npx tsc --noEmit`: clean.
- `npm test`: 45 files, 294 tests passed.
- `npm run build`: OK (Next 16, routes `/`, `/dashboard`, `/login`, `/profile`).

## Backend gap (not changed)
- `MemberResponse` has no `joinedAt`, and `ParticipantService.getMembers` returns `findByChatRoomId` with no sort. The client takes the first
  ADMIN/MEMBER in list order as the "earliest joined". With Mongo natural order this is insertion (join) order in practice, but nothing
  guarantees it. The server's `findSuccessor` stays authoritative. Fix: sort `getMembers` by `joinedAt` (or add `joinedAt` to the response).

## Follow-ups
- SPEC-009 AC-009-28 cites `RoomInfoDialog.test.tsx#render_memberWithoutName_showsDeletedUserWithNeutralAvatar`. The test now lives in
  `RoomPanel.test.tsx` under the same name. CM-067 should update the AC line (the spec is Approved, so I did not edit it).
- DM rows still show Delete for the DM requester (B-01). CM-080 removes it.
- Merge awareness: `ChatInterface.tsx` changes are limited to the dialog imports/block and the removed `isOwner`/`useAuthStore` lines.
  fe-b (CM-079) also edits this file.
