# CM-115: Contextual reply frontend
- Type: feat. Priority: P2. Scope: frontend.
- Spec: SPEC-014 AC-014-7, AC-014-8, AC-014-10 (Approved 2026-10-31). Backend AC-014-1..6, -9 are CM-114.
- Authorization: owner asked to build reply and reactions before releasing v0.2 (chat, 2026-11-02).
- Branch: `feat/CM-115-reply-frontend` from `feat/CM-114-reply-backend` (`cae6d38`).
- Workflow: frontend-delivery, feature in an existing app, Standard depth, real integration. Reuses the
  existing design system (tokens, bubble, menu, banner patterns); no new direction. Owner review: milestone C.

## Goal
Reply to a message from its actions menu or by swiping right on touch, see the quote on the reply, and jump to the
original even when it is not loaded.

## Scope
- In: reply chip with cancel (button and Escape) above the composer; `replyToMessageId` on sends and Resend;
  quote in own and received bubbles (unavailable state, type label for non-text); "Reply" menu item; touch swipe;
  jump to a loaded original (scroll + 2 s highlight); detached segment from the context endpoint with
  "Jump to latest"; E2E `reply.spec.ts`.
- Out: paging inside a detached segment (older/newer from the segment edges), reply to SYSTEM messages from the UI
  (they have no actions menu), threads.

## Expected Files to Touch
- `frontend/lib/types/dto/chat.dto.ts`, `lib/api/messageApi.ts`, `hooks/useWebSocket.ts`, `hooks/useRoomMessage.ts`,
  new `hooks/useMessageContext.ts`, `components/chat/{ChatInterface,MessageList,MessageInput,MessageActions}.tsx`,
  new `components/chat/ReplyQuote.tsx`, tests, `tests/e2e/reply.spec.ts`.
- docs: this ticket, SPEC-014 evidence note.

## Acceptance Criteria
- [x] AC-014-7: chip with cancel; sending clears it; a failed send brings it back.
  `ChatInterface.reply.test.tsx#reply_chip_cancelAndKeepOnFailure`, `#reply_confirmedSend_doesNotRestoreChip`,
  `useRoomMessage.test.ts#sendMessage_reply_publishesTargetIdAndResendKeepsQuote`.
- [x] AC-014-8: loaded original scrolls and highlights; unloaded original opens a detached segment with
  "Jump to latest". `ChatInterface.reply.test.tsx#reply_jumpLoaded_focusesWithoutRequest`,
  `#reply_jumpUnloaded_loadsDetachedSegment`, `#reply_jumpToDeletedOriginal_showsUnavailableToast`,
  `MessageList.reply.test.tsx#*`; E2E `reply.spec.ts#reply_toMessageMoreThan100Back_jumpsToDetachedSegmentAndBack`.
- [x] AC-014-10: right swipe starts a reply; vertical scroll and taps do not; the Reply menu item stays for non-touch
  and assistive use. `MessageActions.swipe.test.tsx#reply_swipeRight_startsReply`, `#reply_verticalScroll_doesNotTrigger`,
  `#reply_menuItem_startsReplyForKeyboardUsers`; E2E `reply.spec.ts#reply_swipeRight_startsReplyAndSends`.

## Behaviour changes to note
- On touch screens the bubble menu now opens on release instead of on press, so a scroll or swipe that starts on a
  bubble no longer opens it. Mouse, keyboard and long press are unchanged.
- The segment state survives switching rooms inside one mounted chat view only for the room it belongs to; another
  room never shows it.

## Verification (2026-11-02, local)
- `npm run lint` 0 errors (13 warnings, none new), `npx tsc --noEmit` clean, `npm test` 65 files pass, `npm run build` pass.
- Full `npm run test:e2e`: 33/34 passed; `dm-journey` failed once on the unread title after unhide (untouched
  area), then passed 2/2 with `--repeat-each=2`; recorded as the known E2E flake, not a regression.
- Backend at this base: `./mvnw verify` pass (CM-114, 638 unit + 110 IT).
- Not done: owner visual review (milestone C), real-device touch check, remote CI.
