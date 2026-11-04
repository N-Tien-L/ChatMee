# CM-118: Message reactions frontend
- Type: feat. Priority: P2. Scope: frontend.
- Spec: SPEC-015 AC-015-9, AC-015-10, and the UI half of AC-015-1 (Approved 2026-10-31). Backend AC-015-1..8, -11 are CM-117.
- Authorization: owner asked to build reply and reactions before releasing v0.2 (chat, 2026-11-02) and to finish the
  remaining v0.2 work (chat, 2026-11-03, "làm phần còn lại luôn").
- Branch: `feat/CM-118-reactions-frontend` from `feat/CM-117-reactions-backend` (`9a8c511`).
- Approach: feature in an existing app. Reuses the existing design system (tokens, chips, menu, Dialog, Sheet); no new
  visual direction. Owner review happens in the two-account browser smoke.

## Goal
React to a message from its actions menu (six defaults or any emoji), see counts under the bubble, see who reacted,
and see changes from other members live.

## Scope
- In: quick bar (👍 ❤️ 😂 😮 😢 😡) and "+" in the bubble menu; re-selecting your current emoji removes it, another
  emoji changes it; lazy-loaded full picker (`frimousse`) in a Dialog on desktop and a bottom Sheet on mobile;
  reaction chips under own and received bubbles; who-reacted list with emoji filter tabs and "Show more" paging;
  optimistic updates with rollback and an error toast; `REACTION_UPDATED` handling on the room topic; session cache
  kept in step; E2E `reactions.spec.ts`.
- Out: reacting inside a detached reply segment (its chips are read-only and open who reacted), live updates for
  messages outside the loaded pages, reaction notifications, self-hosting the picker's emoji data.

## Expected Files to Touch
- `frontend/lib/types/dto/chat.dto.ts`, `lib/api/messageApi.ts`, new `lib/utils/reactions.ts`, `hooks/useWebSocket.ts`,
  `hooks/useRoomMessage.ts`, `hooks/reducers/messageReducer.ts`, new `hooks/useReactors.ts`,
  `components/chat/{ChatInterface,MessageList,MessageActions}.tsx`, new
  `components/chat/{ReactionChips,ReactionPicker,EmojiPickerPanel,ReactionSurface,ReactorsSheet}.tsx`, tests,
  `tests/e2e/reactions.spec.ts`, `package.json` / `package-lock.json` (`frimousse`).
- docs: this ticket, SPEC-015 evidence notes.

## Acceptance Criteria
- [x] AC-015-1 (UI): selecting your current emoji sends DELETE; another emoji sends PUT and moves the one reaction.
  `useRoomMessage.reactions.test.ts#reactions_reselectSame_removes`, `#reactions_selectOther_changes`,
  `lib/utils/reactions.test.ts#*`; E2E `reactions.spec.ts#reactions_quickBarPickerAndWhoReacted_updateLiveForBothMembers`.
- [x] AC-015-9: optimistic apply, rollback on error, room events reconcile counts while keeping your own choice, a
  pending pick ignores events until its response, reconnect refetch is authoritative.
  `useRoomMessage.reactions.test.ts#reactions_optimisticRollbackOnError`, `#reactions_roomEvent_appliesCountsAndKeepsMine`,
  `#reactions_roomEventDuringOwnRequest_waitsForResponse`, `#reactions_reconnect_converges`; E2E as above.
- [x] AC-015-10: quick bar plus "+", lazy picker (Dialog desktop, bottom Sheet mobile), chips under the bubble, chip
  opens who reacted, 360 px layout. `MessageList.reactions.test.tsx#*`; E2E as above and
  `reactions.spec.ts#reactions_mobile_chipsFitAndWhoReactedOpensAsDrawer`.

## Dependency
`frimousse` 0.4.0 (exact), named in SPEC-015 §7: small, headless, unstyled React emoji picker. It is imported only
from `EmojiPickerPanel`, which `ReactionPicker` loads with `next/dynamic`, so it is not in the first chat bundle.
By default it fetches Emojibase data from `cdn.jsdelivr.net` when the picker opens (cached in localStorage); the
E2E serves a local fixture for that request. Self-hosting the data is a follow-up if the owner prefers no
third-party request.

## Behaviour notes
- Frames on `/topic/rooms/{id}` with any `event` field are no longer treated as messages; unknown events are ignored.
  This is the client half of the CM-117 deployment rule: backend CM-117 must ship together with or after this.
- When your own reaction falls outside the event's top 6, the event cannot mark it as yours until the next history
  load or your next pick (the event carries counts only, AC-015-7).

## Follow-ups
- Self-host Emojibase data for the picker (no third-party request when "+" is opened).
- Reactions inside the detached reply segment (needs the segment to receive room events).
