# SPEC-015: Message reactions
- Status: Approved (owner, 2026-10-31); implementation and test evidence pending.
- Owner: @N-Tien-L · Created: 2026-10-30 · Related: SPEC-004, SPEC-007, SPEC-009, SPEC-014; design/websocket-protocol.md, design/data-model.md; plan/V0.2-PLAN.md (M4); tickets CM-116 (spec), CM-117 (backend), CM-118 (frontend)

## 1. Goal
Members react to a message with an emoji, see counts and who reacted, and see changes live,
Messenger-style: a quick bar of six defaults plus a full emoji picker.

## 2. Non-goals
Custom emoji or stickers, reactions on system messages, reaction notifications or unread
effects, per-room emoji restrictions, and moderation tooling. Older clients ignore the new
event and field.

## 3. User stories
- US-1: As a member, I want to react quickly with a default emoji.
- US-2: As a member, I want to pick any emoji via "+".
- US-3: As a member, I want to see who reacted with what.
- US-4: As a member, I want reactions to update live and survive reconnects.

## 4. Acceptance criteria
- AC-015-1: Policy: one reaction per user per message. `PUT .../reaction {emoji}` sets it and
  replaces any previous one (a different emoji changes the reaction, never adds a second);
  repeating the same PUT is idempotent. `DELETE .../reaction` removes it and is idempotent.
  In the UI, selecting the emoji the user already has undoes it (the client sends DELETE);
  selecting another emoji changes it (PUT). -> Test: `react_replaceExisting_keepsOne`, `react_sameEmoji_idempotent`, `react_delete_idempotent`; UI `reactions_reselectSame_removes`, `reactions_selectOther_changes`
- AC-015-2: Storage is a `reactions` collection `{messageId, roomId, userId, emoji, createdAt}`
  with a unique index on `(messageId, userId)`. The index is declared on the entity; no
  destructive migration. (The plan's `(messageId, userId, emoji)` index is narrowed because
  of the one-reaction policy; owner to confirm.) -> IT: `ReactionRepositoryIT#uniqueIndex_rejectsSecondReaction`
- AC-015-3: Emoji validation: exactly one grapheme cluster (`BreakIterator`), at most 32 UTF-8
  bytes, and every code point is an emoji symbol, ZWJ, VS16, skin-tone modifier, regional
  indicator or keycap component, from an explicit allow-list of ranges (JDK 17 has no
  `\p{IsEmoji}`). Anything else returns 400. The quick-bar default set is frontend-only.
  -> Test: `react_invalidEmoji_400`, `react_zwjSequence_accepted`, `react_multipleGraphemes_400`
- AC-015-4: Only an active member of the room may react or read reactions; a non-member,
  unknown room or unknown message returns 404. Reacting in a DM blocked either way returns
  403 under the existing block rules. System and deleted messages return 400/404.
  -> Test: `react_nonMember_404`, `react_blockedDm_forbidden`, `react_systemMessage_rejected`
- AC-015-5: `ChatMessageResponse.reactions` is `[{emoji, count, reactedByMe}]`, top 6 by
  count (ties by first reaction time), computed with one batched query per history page.
  -> Test: `history_includesReactionSummary`, `history_reactionQuery_isBatched`
- AC-015-6: `GET .../reactions?emoji=&cursor=&limit=` lists who reacted (user id, display name,
  emoji, createdAt), newest first, cursor-paged, member-only.
  -> Test: `reactions_list_pagedAndFiltered`
- AC-015-7: After a change the server publishes `REACTION_UPDATED` `{messageId, summary}` on
  the existing `/topic/rooms/{roomId}`; the summary carries counts only (never `reactedByMe`,
  which is computed per client). No new destination. -> Test: `react_publishesRoomEvent`
- AC-015-8: Writes use the existing HTTP rate limiter (429 over the limit).
  -> Test: `react_rateLimited_429`
- AC-015-9: The client applies reactions optimistically, reconciles with the event, and after
  reconnect treats the history refetch as authoritative for loaded messages.
  -> Test: `reactions_optimisticRollbackOnError`, `reactions_reconnect_converges`; E2E `reactions.spec.ts`
- AC-015-10: UI: quick bar of 👍 ❤️ 😂 😮 😢 😡 plus "+" opening a full picker (Dialog on
  desktop, Drawer on mobile), lazy-loaded; chips under the bubble; tapping a chip opens the
  who-reacted sheet; layout works at 360 px. -> E2E `reactions.spec.ts`
- AC-015-11: Deleting a message or room removes its reactions; a left or removed member's
  reactions stay until the message is deleted. -> Test: `deleteMessage_removesReactions`

## 5. Edge cases & Errors
| Scenario | Expected behavior | HTTP / STOMP |
| --- | --- | --- |
| Two concurrent PUTs by one user | One row remains (unique index, upsert) | 200 |
| Event arrives before the optimistic update settles | Counts converge to the server summary | none |
| Emoji with skin tone or ZWJ family | Accepted if one cluster and within 32 bytes | 200 |
| Text, multiple emoji, or control characters | Rejected | 400 |
| Redis down | Rate limiter fails open, as elsewhere | n/a |

## 6. Security & Authorization
Identity from the principal only. Membership and DM-block checks mirror history reads. The
who-reacted list exposes only names already visible to room members. Emoji values are
validated server-side and rendered as text. No new `permitAll`; STOMP origins untouched.

## 7. Non-functional
One extra batched query per history page. Picker library (`frimousse`, small, headless) is
lazy-loaded so the first chat bundle does not grow; dependency reason is stated in the CM-118 PR.

## 8. Related APIs / Protocols
Three REST endpoints under `/api/v1/rooms/{roomId}/messages/{messageId}/`, the
`REACTION_UPDATED` room event, and `ChatMessageResponse.reactions`. CM-116 updates
`websocket-protocol.md` (event shape, ignored by old clients) and `data-model.md`.

## 9. Open questions
- Resolved (owner, 2026-10-31): one reaction per user confirmed, including toggle-off on re-select and change on a different pick; the `(messageId, userId)` unique index is confirmed; reacting to one's own messages is allowed. No open questions.
