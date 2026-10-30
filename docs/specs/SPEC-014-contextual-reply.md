# SPEC-014: Contextual reply to a message
- Status: Draft (awaiting owner Approval; no implementation before it is Approved)
- Owner: @N-Tien-L · Created: 2026-10-30 · Related: SPEC-004, SPEC-008, ADR-0005; design/websocket-protocol.md, design/data-model.md; plan/V0.2-PLAN.md (M3); tickets CM-113 (spec), CM-114 (backend), CM-115 (frontend)

## 1. Goal
A person can reply to a specific earlier message in the same room. The reply shows a short
quote of the original, and tapping the quote jumps to it even when it is far back in history
and not loaded.

## 2. Non-goals
Threads or nested views, replying across rooms, forwarding, editing a reply's target,
quoting media (preview shows a type label), and live updates of a quote after the original
changes. This spec amends SPEC-004 and SPEC-008 additively; their text stays as written.

## 3. User stories
- US-1: As a member, I want to reply to a message so the conversation context is clear.
- US-2: As a member, I want to tap the quote to jump to the original, even if it is old.
- US-3: As a member, I want a clear placeholder when the original is gone.

## 4. Acceptance criteria
- AC-014-1: `ChatMessageRequest` accepts an optional `replyToMessageId` (max 64 chars). The
  server rejects, with a generic validation error, a target that does not exist, is in a
  different room, or is deleted. -> Test: `sendMessage_replyToOtherRoom_rejected`, `sendMessage_replyToDeleted_rejected`
- AC-014-2: The sender must be an active member who may send in the room; the target must be
  readable by the sender under the history rules (no new read right is created).
  -> Test: `sendMessage_replyToUnreadable_rejected`
- AC-014-3: The server derives and stores on the message a `replyTo` snapshot
  `{messageId, senderId, senderName, preview, type}`; `preview` is the target content
  truncated to 120 characters (empty for non-text, where the client shows `type`). Clients
  cannot supply any of these values. -> Test: `sendMessage_reply_storesServerDerivedSnapshot`, `sendMessage_replyPayloadSnapshotIgnored`
- AC-014-4: `replyTo` is nullable, absent on legacy messages, and returned in history pages
  and the room broadcast. Idempotent retries (same `tempId`) keep the original snapshot.
  -> Test: `sendMessage_replyRetry_keepsSnapshot`, `history_legacyMessage_replyToNull`
- AC-014-5: If the original is later deleted, clients render "Original message unavailable"
  (the server redacts the snapshot preview in responses once the target is deleted).
  -> Test: `history_replyToDeletedTarget_redactsPreview`
- AC-014-6: `GET /api/v1/rooms/{roomId}/messages/{messageId}/context?limit=n` returns the
  target and up to `n` (default 20, max 50) messages before and after, ordered by
  `(createdAt, id)`, plus `hasBefore`/`hasAfter` and cursors compatible with the history
  cursor. A non-member, unknown room or unknown message returns 404.
  -> Test: `context_nonMember_returns404`, `context_tiedTimestamps_ordersStably`, `context_limitClamped`
- AC-014-7: The client shows a reply chip above the composer with cancel; sending clears it.
  A failed send keeps the chip. -> Test: `reply_chip_cancelAndKeepOnFailure`
- AC-014-8: Tapping a quote scrolls to and highlights a loaded original. If it is not loaded,
  the client loads the context window as a detached segment (never presented as continuous
  with the live tail, per CM-095) and offers "Jump to latest". -> Test: `reply_jumpUnloaded_loadsDetachedSegment`; E2E `reply.spec.ts` (reply to a message more than 100 back)
- AC-014-9: Replying counts against the existing send rate limit; no new STOMP destination.
  -> Test: `sendMessage_replyRateLimited`

## 5. Edge cases & Errors
| Scenario | Expected behavior | HTTP / STOMP |
| --- | --- | --- |
| Target missing / other room / deleted | Not stored; private error for the tempId | private ERROR `VALIDATION_FAILED` |
| Original deleted after reply | Quote shows "Original message unavailable"; jump disabled | none |
| Original sender left the room | Snapshot name still shown | none |
| Context for a message the caller cannot read | 404, identical to unknown | 404 ProblemDetail |
| Context for a deleted target | 404 | 404 |
| Several messages share a timestamp | Stable order by id tiebreak | none |

## 6. Security & Authorization
Identity comes from the principal. The quoted content is read server-side and copied only
after membership and readability checks; the client cannot inject it. The context endpoint
reuses the history membership check and adds no new `permitAll` path. Snapshot previews and
names are user content: never logged.

## 7. Non-functional
Context query uses the existing `(chatRoomId, createdAt, _id)` index. `limit` is clamped.
Snapshot preview is capped at 120 characters to bound message size.

## 8. Related APIs / Protocols
`ChatMessageRequest.replyToMessageId` (STOMP `/app/chat.sendMessage` payload),
`ChatMessageResponse.replyTo`, new REST context endpoint. CM-113 updates
`docs/design/websocket-protocol.md` (payload fields; no new destination) and
`docs/design/data-model.md` (`messages.replyTo` subdocument).

## 9. Open questions
- OQ-A: Redact the preview when the target is deleted (proposed, AC-014-5), or keep the snapshot text?
- OQ-B: Swipe-right-to-reply on touch: in scope or later? Proposed: optional in CM-115.
