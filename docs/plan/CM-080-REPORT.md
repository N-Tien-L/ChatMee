# CM-080 Safety UI (block, report, hide): report

Worker: `fe-a`. Branch: `feat/CM-080-safety-ui`, from the tip of `feat/CM-066-room-dialogs` (`4384e44`).
Scope: `docs/plan/MVP_V0_PLAN.md` "CM-080", SPEC-008 AC-008-9, SPEC-009 AC-009-15..22, and Reviewer B finding B-01.

## Backend APIs used (existing, unchanged)
- `PUT` / `DELETE /api/v1/users/{userId}/block` (204, idempotent) and `GET /api/v1/users/me/blocks` (`{id, name, avatarUrl, blockedAt}`).
  Source: `UserApiController`.
- `POST /api/v1/reports` `{targetType: USER|MESSAGE|ROOM, targetId, reason: SPAM|HARASSMENT|INAPPROPRIATE|OTHER, note?}` returns 202.
  The note is at most 500 characters. Source: `ReportController`, `CreateReportRequest`.
- `POST /api/v1/rooms/{roomId}/hide` (204). Source: `ChatRoomController`.
- `ChatRoomResponse.blocked`: true for the blocker's DM only.
- Blocking emits no user event, so the client updates its DM's `blocked` flag itself after a block or unblock succeeds.

## Changes
- Types: `ChatRoomResponse.blocked?`, `BlockedUserResponse`, `ReportTargetType`, `ReportReason`, `CreateReportRequest`.
- API, one file per resource: `lib/api/userApi.ts` (`listBlocks`, `blockUser`, `unblockUser`), `lib/api/reportApi.ts` (new: `create`),
  `lib/api/chatRoomApi.ts` (`hideRoom`).
- Stores:
  - `chatRoomsStore`: `hideRoom` removes the row with reason `HIDDEN` (the open view shows "You hid this conversation"), then toasts.
    `setCounterpartBlocked` mirrors a block onto the DM with that user.
  - `usersStore`: `blockedUsers`, `fetchBlocks`, `blockUser`, `unblockUser`, with toasts. A block also drops the user from the current
    search results (AC-009-17).
  - The ticket names `chatRoomsStore` only. Block state lives in the existing `usersStore` because it is user data. No new store was added.
- `components/safety/ReportDialog.tsx` (new): reason radios, an optional note with a 500-character counter and inline error, and the
  right `targetType`/`targetId`. An empty note is omitted. Success shows a thank-you toast. Errors (for example the daily limit) show a
  toast and keep the dialog open.
- `components/safety/BlockedUsersList.tsx` (new), shown on `app/profile/page.tsx`: lists blocks with Unblock, and has loading, empty and
  error/retry states.
- `components/room/RoomPanel.tsx`:
  - DM panel: Hide conversation, Block/Unblock {name} (from `blocked`) and Report {name}. There is no Leave, Delete or Settings in a DM.
  - Group panel: Report room.
  - Member rows: a "More actions for X" button reveals Block/Unblock X and Report X. Block state comes from `GET /users/me/blocks`.
- `components/room/ChatRoomListItem.tsx` (B-01): DM rows offer Hide and never Delete, even when the caller's DM role is OWNER.
  Delete stays OWNER-only for group rooms.
- `components/chat/MessageList.tsx`: a Report button on other members' messages. It is not shown on own messages or SYSTEM rows. It appears on
  hover or keyboard focus, and always on touch screens (`pointer-coarse`).
- `components/user/UserSearchItem.tsx` / `UserSearchList.tsx`: an optional Block button beside a search result. It is used in the
  New message dialog.
- `components/chat/ChatInterface.tsx`: for the blocker's DM (`roomType DIRECT_MESSAGE && blocked`):
  - A banner says "You blocked X. Unblock them to send messages." and has an Unblock button.
  - The composer is disabled through `disabled` and the new `inputDisabled` prop, and `handleSendMessage` returns early.
  - The blocked user sees a normal DM; their sends fail with the existing generic error (AC-009-18).
  - It also renders the ReportDialog for message reports.

## AC -> implementation -> test
| AC | Implementation | Test |
|---|---|---|
| Block/unblock flows update the UI; blocked DM shows the banner and disables input for the blocker (AC-009-15/19) | `ChatInterface` banner + `inputDisabled`; `usersStore.blockUser/unblockUser`; `setCounterpartBlocked` | `ChatInterface.blocked.test.tsx#render_blockerOfDm_showsBannerAndDisablesComposer`, `#unblock_fromBanner_callsApiAndRestoresSending`, `#render_notBlocked_composerEnabledWithoutBanner`; `usersStore.test.ts#blockUser_success_dropsUserFromResultsAndFlagsTheirDm`, `#blockUser_failure_keepsStateAndReturnsFalse`; `chatRoomsStore.test.ts#setCounterpartBlocked_dmWithUser_flagsOnlyThatDm` |
| Block/Unblock on member rows, search results and the DM panel | `RoomPanel`, `UserSearchItem` | `RoomPanel.test.tsx#block_directMessage_callsBlockAndFlagsTheDm`, `#unblock_blockedDirectMessage_callsUnblock`, `#memberRow_moreActions_blocksAndReportsThatMember`, `#memberRow_alreadyBlocked_offersUnblock`; `UserSearchItem.test.tsx#block_withOnBlock_callsBlockWithoutTheMainAction`, `#render_withoutOnBlock_hasNoBlockAction` |
| Unblock path: blocked list on the profile page | `BlockedUsersList` | `BlockedUsersList.test.tsx#render_blocks_listsThemAndUnblockRemovesRowAndRestoresDm`, `#render_loadFailure_showsRetry` |
| Report dialog validates the note (500) and posts the right target (AC-009-20) | `ReportDialog`, `reportApi` | `ReportDialog.test.tsx#submit_noReason_isDisabled`, `#note_over500Characters_showsErrorAndBlocksSubmit`, `#submit_USERTarget_...`, `#submit_MESSAGETarget_...`, `#submit_ROOMTarget_postsTargetReasonAndNote`, `#submit_emptyNote_omitsNote`, `#submit_serverError_showsErrorToastAndStaysOpen` |
| Report entry points: user (DM panel, member row), message (hover), room | `RoomPanel`, `MessageList` | `RoomPanel.test.tsx#report_directMessageCounterpart_opensUserReport`, `#report_groupRoom_opensRoomReport`; `MessageList.report.test.tsx#report_otherMembersMessage_callsOnReportWithThatMessage`, `#render_ownAndSystemMessages_haveNoReportAction` |
| Hide removes the row; DMs never show Delete (AC-008-9, AC-009-21/22, B-01) | `ChatRoomListItem`, `RoomPanel`, `chatRoomsStore.hideRoom` | `ChatRoomListItem.test.tsx#menu_directMessageOwnedByCaller_offersHideAndNeverDelete`, `#hide_directMessage_callsStoreHide`; `chatRoomsStore.test.ts#hideRoom_directMessage_removesRowWithHiddenReason`, `#hideRoom_serverRejects_keepsRow`; `RoomPanel.test.tsx#render_directMessage_offersHideBlockReportAndNoLeaveOrDelete`, `#hide_directMessage_callsStoreHideAndCloses` |

## Gates (frontend/)
- `npm run lint`: 0 errors, 8 warnings (baseline 11). This branch also clears the `set-state-in-effect` warnings that CM-066 added in
  `RoomPanel`/`LeaveRoomConfirm`, and an unused import in `states.test.tsx`. None of the remaining 8 is in a file this ticket added.
- `npx tsc --noEmit`: clean.
- `npm test`: 50 files, 325 tests passed.
- `npm run build`: OK.

## Merge awareness (fe-b, CM-079 `feat/CM-079-requests-inbox` dd44a82)
- `MessageInput.tsx`: the `inputDisabled` prop is text-identical to fe-b's hunk (same doc comment, default, `disabled={inputDisabled}` and
  `disabled:cursor-not-allowed`), so the file merges without a conflict.
- `ChatInterface.tsx` will conflict on the `<MessageInput>` props and the send guard. Both branches change those lines. Resolve it like this:
  ```tsx
  if (!newMessage.trim() || !connected || requestUsed || blocked) return;
  ...
  disabled={!newMessage.trim() || !connected || requestUsed || blocked}
  inputDisabled={requestUsed || blocked}
  pausedHint={ /* keep fe-b's expression unchanged; the blocked reason is the banner above the composer */ }
  ```
  fe-b also changes `canResend={connected && !requestUsed}`. I left that line alone. Adding `&& !blocked` there would be a good addition at
  merge time.
- CM-066 already replaced `RoomInfoDialog`/`RoomSettingsDialog` with `RoomPanel` in `ChatInterface.tsx`. fe-b's branch still imports the
  old dialogs, so that hunk also needs taking from this side.

## Backend gaps (not changed)
- No user event follows a block or unblock. The blocker's other tabs keep the old `blocked` value until they next load `GET /rooms`. A
  `ROOM_UPDATED` to the blocker's sessions would fix that.
- From CM-066: `GET /rooms/{id}/members` is not sorted by `joinedAt`, so the client's successor name is best-effort.

## Follow-ups
- The plan names `ChatInterface.blocked.test.tsx`, `ReportDialog.test.tsx` and `ChatRoomListItem.test.tsx`. All three exist; the extra
  test files are listed above. CM-067 records the AC lines in SPEC-009 (Approved, not edited here).
- Resend of a failed message in a blocked DM is not disabled (see the `canResend` note). The server still rejects it with the generic
  error.
