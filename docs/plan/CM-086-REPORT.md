# CM-086 frontend v0 readiness fixes: report

Worker: `fe-fix`. Branch: `fix/CM-086-frontend-readiness`.
Source of findings: `docs/plan/V0-READINESS-B-REPORT.md` (Reviewer B), items B-03, B-06, B-07 and B-08.

## Base commit

The worktree started on `main` (`3cb5f89`), which has neither the reviewed code (for example
`components/fx/constellation-grid.tsx`) nor the review report. Reviewer B reviewed `feat/CM-084-mobile-account-menu` at
`b46a2d5`, so this branch starts from `b46a2d5`. Merging it means merging that CM-084 branch first, or together with it.
The review report is still untracked in the main checkout and is not committed on this branch.
`frontend/AGENTS.md` and `frontend/CLAUDE.md` are also untracked there; I read them from that checkout.

## Changes per item

### B-03: Create room offered settings that v0 removes (SPEC-008 section 2, AC-008-10)
- `components/room/CreateRoomModal.tsx`: removed the Welcome message input, the Allow file sharing and Require moderation
  checkboxes, their state and reset code, and the More options disclosure, which had nothing left in it. The create request
  no longer sends `settings`, so `welcomeMessage`, `allowFileSharing`, `allowGuestUsers` and `moderationRequired` are gone
  from it. The backend already falls back to its default settings when the field is null (`GroupRoomPolicy`).
  Options that remain: name, Public/Private, maximum members and description. The `RoomSettings` type is unchanged
  because room responses still carry the field ("the backend field stays until v1").

### B-06: constellation degradation never triggered
- `components/fx/constellation-grid.tsx`: `schedule(resume = true)`. The loop calls `schedule(false)`, so `prevFrameAt` and
  `lastTime` keep the previous frame's time and the slow-frame average sees the real interval. Every other caller (first
  start, IntersectionObserver back on screen, tab back in the foreground, reduced motion turned off) resumes after a pause.
  Those calls reset both clocks, so the pause gap is not counted as a slow frame. The early return when a frame is already
  queued comes before the reset, so a resume event that arrives while the loop is running resets nothing.

### B-07: ROOM_REMOVED reason ignored
- `lib/stores/chatRoomsStore.ts`: added a `RoomEndReason` type (`LEFT | REMOVED | DELETED | HIDDEN | DECLINED | EXPIRED`, from
  `docs/design/websocket-protocol.md`) and `endedRooms: Record<roomId, reason>`. `removeRoom(roomId, reason?)` stores the
  reason from the user event in the same update that removes the row. An unknown reason removes the row without storing
  anything. The entry is cleared when the room comes back (`upsertRoom`, `addRoom`, `setRooms`). `DECLINED` and `EXPIRED`
  also show a toast ("Your message request to X was declined" / "... expired"), deduplicated by room id, as
  `MVP_V0_PLAN.md` describes for CM-079.
- `components/chat/ChatInterface.tsx`: when a room that this view has shown disappears, the ended view uses the reason from
  the user event. It does not wait for a room-topic frame. A deletion seen first on the room topic still wins as `DELETED`.
  With no reason at all (for example, a refetch dropped the room), the view falls back to "You are no longer a member".
  Text for each reason: DELETED "This room was deleted", REMOVED "You are no longer a member" (both from SPEC-008), LEFT "You
  left this room", HIDDEN "You hid this conversation", DECLINED "Your message request was declined", EXPIRED "Your message
  request expired without an answer".

### B-08: account menu keyboard navigation
- `components/common/UserMenu.tsx`: the menu button now follows the WAI-ARIA APG pattern.
  - On the trigger, Enter, Space or ArrowDown opens the menu and focuses the first item; ArrowUp focuses the last item.
  - Inside the menu, ArrowUp/ArrowDown move with wrap-around, Home/End jump to the ends, and Space activates the Profile
    link.
  - Escape still closes the menu and returns focus to the trigger.
  - The keydown's `preventDefault` stops the native click from toggling the menu shut again. Space keyup is also prevented,
    because Firefox clicks on keyup.
  - Mouse opening leaves focus where it is, as before.
- The mobile stacking fix from CM-084 is kept: the panel's markup and classes are unchanged, and it is not portalled
  (`absolute z-50` inside the `z-20` header). No dropdown primitive was added: `components/ui` has none, and adding one
  would be a new component or dependency.

## Tests added or changed

| Item | Test |
|---|---|
| B-03 | `components/room/CreateRoomModal.test.tsx` (new): `render_detailsStep_showsNoUnsupportedSettings`, `create_publicRoom_sendsOnlySupportedOptions` (exact request, no `settings` key) |
| B-06 | `components/fx/constellation-grid.test.tsx` (new). The harness has a manual clock, a manual rAF queue, a fake 2D context that counts drawn dots, and controllable IntersectionObserver/matchMedia. Tests: `loop_sustainedSlowFrames_coarsensMeshThenFreezes` (60 ms frames: at frame 45 the backing store goes from 2x to 1x and the dots go from 504 to 216; at frame 90 no frame is queued, i.e. frozen), `loop_fastFrames_keepsFullQuality`, `resume_afterOffscreenPause_doesNotCountGapAsSlowFrame` (10 s off screen, then 100 fast frames stay at full quality) |
| B-07 | `lib/stores/chatRoomsStore.events.test.ts`: the existing per-reason test now also checks `endedRooms`. New: `handleUserEvent_roomRemoved{DECLINED,EXPIRED}_toastsRequestOutcome`, `handleUserEvent_roomRemoved{LEFT,REMOVED,DELETED,HIDDEN}_noRequestToast`, `handleUserEvent_roomRemovedUnknownReason_removesRoomWithoutReason`, `upsertRoom_afterRemoval_clearsEndedReason`. The react-hot-toast mock is now callable. |
| B-07 | `components/chat/ChatInterface.ended.test.tsx` (new): `userEvent_roomRemoved{DELETED,REMOVED,LEFT,HIDDEN,DECLINED,EXPIRED}_showsMatchingEndedView` (user event only, no room-topic frame), `userEvent_unknownReason_fallsBackToNoLongerMember`, `roomTopicDeletion_beforeUserEvent_showsDeleted`, `render_roomNeverListed_showsNotFound` |
| B-08 | `components/common/UserMenu.test.tsx`: `keyDown{Enter,Space,ArrowDown}_onTrigger_opensMenuAndFocusesFirstItem`, `keyDownArrowUp_onTrigger_opensMenuAndFocusesLastItem`, `keyDownEnter_onTrigger_preventsNativeClickToggle`, `keyDownArrows_inMenu_moveFocusAndWrap`, `keyDownHomeEnd_inMenu_focusesFirstAndLastItem`, `keyDownEscape_fromMenuItem_closesAndReturnsFocusToTrigger`, `click_trigger_keepsMenuPanelInsideHeaderStackingContext` |

Both B-06 tests catch a real defect. Against the unfixed component, `loop_sustainedSlowFrames_coarsensMeshThenFreezes`
fails. Against a naive fix that never resets the clocks (`if (false && resume)`),
`resume_afterOffscreenPause_doesNotCountGapAsSlowFrame` fails. With the real fix, all three pass.

## Gate results (in `frontend/`, Node v23.6.0)

| Command | Result |
|---|---|
| `npm ci` | exit 0 (node_modules was missing in the worktree) |
| `npm run lint` | exit 0, **0 errors, 11 warnings**. Same count as Reviewer B's baseline, and none are in files this ticket changed (InvitePeopleDialog, RoomInfoDialog, RoomSettingsDialog, ui/sidebar, UserSearchList, use-mobile, useRoomMessage, apiClient, authApi). |
| `npx tsc --noEmit` | exit 0, no diagnostics |
| `npm test` | **43 files, 269 tests passed** (baseline was 40 files, 238 tests) |
| `npm run build` (`next build --turbopack`) | **exit 0**, run twice. Compiled, TypeScript passed, 7/7 static pages, Proxy present. The child-process error Reviewer B reported did not happen in this worktree, so the webpack diagnostic was not needed and was not run. |

## Follow-ups (not done here)

- B-01 (DM Delete and the missing hide/block/report actions), B-02 (member management, and owner taken from `createdBy`),
  B-04 (a pending DM can still send) and B-05 (native `alert`/`prompt` in Room Settings) remain open for CM-080, CM-066,
  CM-079 and CM-066 respectively. RoomInfoDialog, RoomSettingsDialog, ChatRoomListItem, MessageInput and ChatHeader were not
  touched.
- `leaveRoom` in `chatRoomsStore` still uses `console.error` and refetches instead of using the `LEFT` user event. This
  predates CM-086 and is not changed here.
- The `RoomSettings` frontend type still lists the four inactive settings, because they come back in room responses. Drop
  it from the type when the backend field goes away in v1.
- The account menu does not close on Tab out (APG suggests it should). A focusout-based close breaks Safari, where a button
  click does not focus the button, so it was left out. Revisit with a proper menu primitive in the keyboard/accessibility
  pass (Reviewer B follow-up 7).
- `frontend/AGENTS.md`, `frontend/CLAUDE.md` and `docs/plan/V0-READINESS-*-REPORT.md` are untracked in the main checkout.
  Commit them through the owner if they should be versioned.
- The local Turbopack build passed here but failed for Reviewer B on the same machine. The failure looks intermittent or
  environment-specific, so still reproduce the gate in CI under the documented Node 22 (Reviewer B follow-up 1).
