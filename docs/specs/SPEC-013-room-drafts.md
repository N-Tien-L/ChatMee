# SPEC-013: Per-room message drafts
- Status: Approved (owner, 2026-10-31); implementation and test evidence pending.
- Owner: @N-Tien-L · Created: 2026-10-30 · Related: SPEC-004, SPEC-008, SPEC-011; plan/V0.2-PLAN.md (M2, OQ-04); ticket CM-111 (spec) / CM-112 (implementation)

## 1. Goal
Unsent text in the composer survives switching rooms and reloading the tab, so a person who
leaves a half-written message does not lose it. The draft is a convenience of the current
browser tab only; it is never sent automatically and never leaves the browser.

## 2. Non-goals
Cross-device or cross-tab sync, server-side drafts, attachments or reply targets in drafts
(text only), drafts for edits, long-term persistence beyond 24 hours, any new backend API
or STOMP destination, and a new dependency.

## 3. User stories
- US-1: As a user, I want the text I typed in a room to still be there when I switch back to it.
- US-2: As a user, I want my draft to survive a page reload in the same tab.
- US-3: As a user on a shared computer, I want my drafts gone when I sign out or another
  account signs in.
- US-4: As a user, I want a failed send to keep my text so I can retry.

## 4. Acceptance criteria
- AC-013-1: Given text typed in room A, when the user opens room B and returns to A, then the
  composer shows the same text. -> Test: `draft_switchRooms_restoresText`
- AC-013-2: Storage is `sessionStorage` under key `chatmee:draft:v1:<userId>:<roomId>` with
  value `{text, updatedAt}` (ISO-8601 UTC). Only text is stored; no tokens, ids of other
  users, reply targets or message metadata. -> Test: `draft_write_storesTextOnlyUnderNamespacedKey`
- AC-013-3: A draft whose `updatedAt` is more than 24 hours old is ignored and removed when
  read; each edit refreshes `updatedAt`. -> Test: `draft_expiredAfter24h_discarded`
- AC-013-4: Writes are debounced (about 300 ms) and an empty or whitespace-only composer
  removes the entry. Pending writes flush on room switch and unmount. -> Test: `draft_clearText_removesEntry`
- AC-013-5: The draft is cleared when the server-confirmed echo of the sent message arrives,
  not on the optimistic send; a failed send keeps the draft. -> Test: `draft_failedSend_keepsText`, `draft_confirmedSend_clears`
- AC-013-6: Confirmed logout clears every draft of the signed-out account through the existing
  account-cache clearing in `authStore`. -> Test: `draft_logout_clearsAccountNamespace`
- AC-013-7: An expired login keeps drafts, but when a different account is observed, all
  other-account draft keys are purged. -> Test: `draft_differentAccount_purgesOtherNamespace`
- AC-013-8: When the room becomes unavailable to the user (ended with LEFT, REMOVED, DELETED,
  HIDDEN, DECLINED or EXPIRED, or the counterpart is blocked) the room's draft is removed.
  -> Test: `draft_accessLost_cleared`
- AC-013-9: If `sessionStorage` is unavailable or throws (private mode, quota), the composer
  still works with an in-memory draft for the current page lifetime and shows no error.
  -> Test: `draft_storageUnavailable_fallsBackToMemory`
- AC-013-11: The room row shows both hints; neither replaces the other. The unread badge is
  unchanged. The preview line shows `Draft: <text>` (truncated, styled as a draft) in place of
  the last-message preview while a non-empty draft exists, and returns to the last message when
  the draft is cleared. A draft never marks a room read or unread.
  -> Test: `roomsList_draftAndUnread_showsBadgeAndDraftPreview`
- AC-013-10: Drafts are never sent without an explicit user send action.
  -> E2E: `drafts.spec.ts`

## 5. Edge cases & Errors
| Scenario | Expected behavior | HTTP / STOMP |
| --- | --- | --- |
| Corrupt JSON or wrong shape in storage | Ignore and remove the entry | none |
| Draft longer than the message limit | Restored as typed; existing send validation applies | none |
| Same room open in two tabs | Each tab has its own `sessionStorage`; no sync | none |
| Send echo arrives for another message of the same room | Draft is cleared only for the send the composer submitted | none |
| Room is deleted while a draft exists | Draft removed (AC-013-8) | none |

## 6. Security & Authorization
Key namespace includes the authenticated `userId`, so one account never reads another's draft.
`sessionStorage` is per tab and cleared when the tab closes. Draft text is user content: it
must not be logged. No server round trip, so no new authorization rule.

## 7. Non-functional
No effect on the first-load bundle beyond a small store. Writes are debounced; reads happen
once per room open. Not instrumented.

## 8. Related APIs / Protocols
None. Implementation touches only `frontend/` (`lib/stores/draftStore.ts`, `ChatInterface`,
`MessageInput`, `authStore` clear hook, `chatRoomsStore` end-state hook).

## 9. Open questions
- Resolved (owner, 2026-10-31): show the Draft hint, together with the unread badge (AC-013-11). No open questions.
