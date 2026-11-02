# CM-114: Contextual reply backend
- Type: feat. Priority: P2. Scope: messages.
- Spec: SPEC-014 AC-014-1..6, AC-014-9 (Approved 2026-10-31). Frontend AC-014-7, -8, -10 are CM-115.
- Authorization: owner asked to build reply and reactions before releasing v0.2 (chat, 2026-11-02).
- Branch: `feat/CM-114-reply-backend` from develop `ec33251`.

## Goal
Let a send name an earlier message of the same room as its reply target, store a server-derived quote,
return it in broadcasts and history, and serve a context window for jumping to an old original.

## Scope
- In: `ChatMessageRequest.replyToMessageId`, `Message.replyTo` snapshot, `ChatMessageResponse.replyTo`
  (`ReplyToResponse`), deleted-target redaction, `GET /api/v1/rooms/{roomId}/messages/{messageId}/context`
  (`MessageContextResponse`), private VALIDATION_FAILED for an unusable target, design doc updates.
- Out: frontend (CM-115), message deletion API (none exists; `isDeleted` is honoured where present),
  forward history paging, new STOMP destinations, migrations, indexes.

## Expected Files to Touch
- backend: `model/Message.java`, `dto/request/ChatMessageRequest.java`, `dto/response/ChatMessageResponse.java`,
  new `dto/response/ReplyToResponse.java`, new `dto/response/MessageContextResponse.java`,
  `repository/MessageRepository.java`, `service/MessageService.java`, `controller/MessageController.java`,
  `controller/ChatWebSocketController.java`, tests.
- docs: `design/websocket-protocol.md`, `design/data-model.md`, SPEC-014 evidence note, this ticket.

## Acceptance Criteria
- [x] AC-014-1: missing / other-room / deleted target rejected with one generic text, nothing stored.
  `MessageReplyServiceTest#sendMessage_replyToOtherRoom_rejected`, `#sendMessage_replyToDeleted_rejected`,
  `#sendMessage_replyToMissing_rejectedWithSameText`,
  `ChatWebSocketControllerTest#sendMessage_unusableReplyTarget_sendsPrivateValidationErrorWithoutBroadcast`.
- [x] AC-014-2: the target is read only after the membership checks. `#sendMessage_replyToUnreadable_rejected`.
- [x] AC-014-3: server-derived snapshot, 120-code-point preview, empty for non-text, client values ignored.
  `#sendMessage_reply_storesServerDerivedSnapshot`, `#sendMessage_replyPayloadSnapshotIgnored`,
  `#sendMessage_systemTarget_usesTypeLabelWithEmptyPreview`.
- [x] AC-014-4: nullable, legacy null, retries keep the snapshot. `#sendMessage_replyRetry_keepsSnapshot`,
  `#history_legacyMessage_replyToNull`, `MessageRepositoryIT#replySnapshot_roundTrips_andLegacyRowsHaveNone`.
- [x] AC-014-5: preview redacted once the target is deleted. `#history_replyToDeletedTarget_redactsPreview`,
  `MessageRepositoryIT#findByIdInAndIsDeletedTrue_returnsOnlyDeletedTargets`.
- [x] AC-014-6: context window, 404s, stable tie order, clamped limit. `#context_nonMember_returns404`,
  `#context_unknownRoomOrDeletedOrForeignTarget_returns404`, `#context_limitClamped`,
  `#context_window_ordersOldestFirstWithCursorsOnlyWhenMore`, `MessageRepositoryIT#context_tiedTimestamps_ordersStably`,
  `MessageControllerWebMvcTest#getMessageContext_*`.
- [x] AC-014-9: reply shares the send rate limit. `WsRateLimitInterceptorTest#sendMessage_replyRateLimited`.

## Notes
- The context response adds `targetId` and names its cursors `beforeCursor` / `afterCursor`; the spec requires
  "cursors compatible with the history cursor" without naming them. `afterCursor` has no consumer yet (no forward
  history parameter exists); the client fills forward by requesting context again or jumping to latest.
