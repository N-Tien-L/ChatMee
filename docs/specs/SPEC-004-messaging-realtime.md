# SPEC-004: Real-time messaging and history
- Status: Approved
- Owner: @N-Tien-L · Created: 2026-10-09 · Related: ADR-0003, ADR-0004, design/websocket-protocol.md

## 1. Goal
Members exchange messages in real time over STOMP on a plain WebSocket, never lose a message that the server confirmed, and see a clear state for messages that failed.

## 2. Non-goals
- Attachments, edits, reactions, read receipts (phase 3).
- Message fan-out across several backend instances (single broker per instance today).

## 3. User stories
- US-1: As a member, I send a message and everyone in the room sees it immediately.
- US-2: As a member, I see when my message failed and can resend it.
- US-3: As a member, I scroll up to load older messages.
- US-4: As a member, after a network drop I get the messages I missed.

## 4. Acceptance criteria
Room topics are `/topic/rooms/{roomId}` (CM-042); the inbound `/app/chat.sendMessage` destination is unchanged.
- AC-004-1: STOMP CONNECT needs a valid single-use token (ADR-0004); a missing or invalid one gets an ERROR frame and the connection closes. -> Implemented. Test: `StompMessagingIT#connect_missingToken_receivesErrorAndCloses`, `StompMessagingIT#connect_reusedToken_receivesErrorAndCloses`, `AuthChannelInterceptorTest#preSend_reusedToken_rejectsSecondConnect`
- AC-004-2: SUBSCRIBE `/topic/rooms/{roomId}` succeeds only for members of an active room. -> Implemented for `/topic/rooms/{roomId}` (CM-042). Test: `AuthChannelInterceptorTest#preSend_nonMemberSubscription_deniesRoomMessagesAndTyping`, `StompMessagingIT#subscribe_nonMember_receivesErrorAndCloses`
- AC-004-3: SEND `{content, clientMessageId}`: the sender comes from the Principal, content is 1-5000 characters, and the message is persisted before it is broadcast with `{id, clientMessageId, roomId, sender, content, createdAt (ISO-8601 UTC)}`. -> Implemented with current names (`tempId`, `chatRoomId`, `senderId`/`senderName`). Only `TEXT` is accepted from clients (CM-056). Test: `ChatWebSocketControllerAuthTest#sendMessage_validMessage_persistsBeforeBroadcast`, `ChatWebSocketControllerAuthTest#sendMessage_forgedSender_savesAndBroadcastsPrincipalIdentity`, `ChatWebSocketControllerValidationTest#sendMessage_contentOf5001Characters_reportsErrorWithoutSavingOrBroadcasting`, `ChatWebSocketControllerValidationTest#sendMessage_systemMessageType_reportsErrorWithoutSavingOrBroadcasting`, `MessageServiceTest#serialize_messageResponse_usesUtcInstantAndFrontendFlagNames`
- AC-004-4: On a failure (not a member, invalid content, rate limit) only the sender receives `/user/queue/errors {clientMessageId, code, message}`. -> Implemented (`tempId`, `code` since CM-056). Test: `ChatWebSocketControllerAuthTest#sendMessage_saveFailure_sendsPrivateErrorWithoutBroadcast`, `StompMessagingIT#sendMessage_oversizedContent_deliversPrivateErrorOnlyToSender`, `WsRateLimitInterceptorTest#preSend_chatOverLimit_dropsFrameAndSendsRateLimitedErrorWithTempId`
- AC-004-5: Client: an optimistic message goes from `sending` to `sent` when the echo with the same id arrives, or to `failed` on an error or after 10 s; a failed message has a "Resend" action. -> Implemented (CM-029, CM-046): states and the 10 s timeout; a failed message offers Resend and Discard. Test: `hooks/reducers/messageReducer.test.ts`, `hooks/reducers/messageReducer.resend.test.ts`, `components/chat/MessageList.states.test.tsx`
- AC-004-6: History: `GET /rooms/{id}/messages?before=<cursor>&limit=50` returns messages in time order with `nextCursor`; scrolling up loads more. -> Backend cursor pagination implemented (CM-044; orchestrator verification pending; frontend scrolling delivered in the coordinated CM-044 wave). Test: `MessageControllerWebMvcTest#getMessages_noCursor_returnsNewestPageWithNextCursor`, `MessageControllerWebMvcTest#getMessages_malformedCursor_returns400Problem`, `MessageServiceTest#getMessages_oversizedOrInvalidLimit_clampsLimit`, `MessageServiceTest#getMessages_pageOfMessages_loadsSenderNamesInOneQuery`, `MessageRepositoryIT#findPage_sameCreatedAt_pagesWithoutGapsOrDuplicates`, `MessageRepositoryIT#findPage_softDeletedMessages_areExcluded`
- AC-004-7: Reconnect: the client reconnects with backoff, re-subscribes, and fetches missed messages; the UI shows "Reconnecting…". -> Implemented with a refetch of the newest page and merge by message ID (CM-045; frontend `lib/realtime/stompSession.test.ts`); CM-044 adds older-page `before=` pagination only. `after=` catch-up is not implemented and is outside CM-044. Backend newest-page contract test: `MessageControllerWebMvcTest#getMessages_noCursor_returnsNewestPageWithNextCursor` (orchestrator verification pending).
- AC-004-8: Switching rooms drops the old room's subscriptions; messages of another room never show in the current view. -> Implemented (CM-013, CM-045; frontend `hooks/reducers/messageReducer.test.ts`).

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| Same `clientMessageId` sent twice | Stored once (idempotent) | Not implemented, open question |
| Content with HTML | Rendered as text (React escapes it) | — |
| More than 10 messages in 5 s | Frame dropped, private `RATE_LIMITED` error | STOMP (CM-056) |
| Handshake from a foreign `Origin` | Rejected | 403 (`StompMessagingIT#handshake_foreignOrigin_rejectedWith403`) |

## 6. Security & Authorization
Identity always comes from the STOMP Principal; SUBSCRIBE and SEND go through allowlists (`AuthChannelInterceptor`); errors are private to the sender.

## 7. Non-functional
- Per-user inbound limits: chat 10/5 s, typing 10/5 s, presence 20/60 s (CM-056).
- Logs carry `requestId`/`userId`, never message content (CM-051b).

## 8. Related APIs / Protocols
docs/design/websocket-protocol.md, docs/design/error-handling.md, OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Resolved 2026-10-12 (D-12): idempotent sends are specified in SPEC-008 AC-008-13 and implemented by CM-068. The key is `(chatRoomId, senderId, clientMessageId)`, deduplication uses the client id only (no content window), and Resend reuses the failed message's id. A broadcast failure after a successful save is logged and does not report the send as failed; the message resolves on the next resync.
- Resolved 2026-10-12 (D-11): ordering by app-side `Instant.now()` is acceptable because v0 runs one backend instance. Ordering across instances and `after=` catch-up are v1, together with cross-instance fan-out.
- Resolved 2026-10-12 (D-13): history of a soft-deleted room keeps answering 403 in v0.
