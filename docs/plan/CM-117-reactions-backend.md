# CM-117: Message reactions backend
- Type: feat. Priority: P2. Scope: messages.
- Spec: SPEC-015 AC-015-1..8, AC-015-11 (Approved 2026-10-31). Frontend AC-015-9, -10 are CM-118.
- Authorization: owner asked to build reply and reactions before releasing v0.2 (chat, 2026-11-02; "lam 117").
- Branch: `feat/CM-117-reactions-backend` from `feat/CM-115-reply-frontend` (`0133687`).

## Goal
Members set, change and remove one emoji reaction per message, read counts with their own choice and a who-reacted
list, and receive live count updates on the room topic.

## Scope
- In: `reactions` collection and indexes, `EmojiValidator`, `ReactionService`, `ReactionController`
  (PUT/DELETE `.../reaction`, GET `.../reactions`), `ChatMessageResponse.reactions` on history and context pages,
  `REACTION_UPDATED` on `/topic/rooms/{roomId}`, room soft delete removes reactions, design docs.
- Out: frontend (CM-118), message deletion (no API exists), reaction notifications, custom emoji.

## Expected Files to Touch
- backend main: `model/Reaction.java`, `repository/{ReactionRepository,ReactionRepositoryCustom,ReactionRepositoryCustomImpl,ReactionTally}.java`,
  `util/EmojiValidator.java`, `service/ReactionService.java`, `controller/ReactionController.java`,
  `dto/request/ReactionRequest.java`, `dto/response/{ReactionSummaryResponse,MessageReactionsResponse,ReactorResponse,ReactorPageResponse}.java`,
  `dto/event/ReactionUpdatedEvent.java`; edits to `ChatMessageResponse`, `MessageService`, `ChatRoomService`, `UserEventPublisher`.
- backend tests and docs: `design/websocket-protocol.md`, `design/data-model.md`, SPEC-015 evidence notes, this ticket.

## Acceptance Criteria
- [x] AC-015-1: one reaction, replace, idempotent PUT/DELETE. `ReactionRepositoryIT#react_replaceExisting_keepsOne`,
  `#react_sameEmoji_idempotent`, `#react_delete_idempotent`, `#react_concurrentPutsByOneUser_leaveOneRow`,
  `ReactionServiceTest#react_delete_idempotent`. (UI toggle cases belong to CM-118.)
- [x] AC-015-2: entity-declared unique `(messageId, userId)`. `ReactionRepositoryIT#uniqueIndex_rejectsSecondReaction`.
- [x] AC-015-3: one emoji, at most 32 bytes, allow-listed code points. `EmojiValidatorTest` (19 cases),
  `ReactionServiceTest#react_invalidEmoji_400`, `ReactionControllerWebMvcTest#react_invalidEmoji_400`.
- [x] AC-015-4: member-only 404, blocked DM 403, SYSTEM 400, deleted 404. `ReactionServiceTest#react_nonMember_404`,
  `#react_unknownRoomOrMessage_404`, `#react_blockedDm_forbidden`, `#react_systemMessage_rejected`, WebMvc 404/403.
- [x] AC-015-5: top-6 summary, one batched aggregation per page. `MessageReplyServiceTest#history_includesReactionSummary`,
  `#history_reactionQuery_isBatched`, `ReactionServiceTest#summaries_topSixByCountThenFirstReaction`,
  `ReactionRepositoryIT#history_includesReactionSummary_tallyGroupsPerMessageAndEmoji`.
- [x] AC-015-6: who-reacted, newest first, cursor, emoji filter, member-only.
  `ReactionServiceTest#reactions_list_pagedAndFiltered`, `ReactionRepositoryIT#reactions_list_pagedAndFiltered`,
  `ReactionControllerWebMvcTest#reactions_list_pagedAndFiltered`.
- [x] AC-015-7: `REACTION_UPDATED` counts-only on the room topic. `ReactionServiceTest#react_publishesRoomEvent`.
- [x] AC-015-8: HTTP rate limit. `RateLimitingFilterTest#react_rateLimited_429`.
- [x] AC-015-11 (room part): `ReactionRepositoryIT#deleteRoom_removesReactions`, `ReactionServiceTest#deleteRoom_removesReactions`,
  `ChatRoomServiceTest#deleteChatRoomById_creator_softDeletesCleansUpAndBroadcasts`. Message part: no deletion API.

## Verification (2026-11-02, local)
- `./mvnw verify`: 684 unit + 118 IT, 0 failures (Testcontainers Mongo/Redis).

## Owner notes and follow-ups
- Deploy constraint: the current frontend treats every room-topic frame as a message, so the `REACTION_UPDATED`
  frame would render as an empty bubble. Ship CM-117 only together with CM-118. SPEC-015 §2 says older clients
  ignore the event; that holds only from CM-118 on (not edited here).
- Spec deviation (implementation detail): AC-015-3 names `BreakIterator`; JDK 17 splits ZWJ sequences, so an
  explicit grammar is used. Same accept/reject intent; recorded in the spec evidence note.
- Follow-up: a REQUESTED DM that is declined or expires (`softDeleteRequested`) does not remove reactions on its one
  request message; they are unreachable once the room is gone.
- `ResponseContractTest` expected JSON gains `"reactions":[]` (the new field, AC-015-5).
