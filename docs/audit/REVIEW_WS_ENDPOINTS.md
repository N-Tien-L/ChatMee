# WebSocket endpoints: review findings and follow-up tickets

- Scope: STOMP endpoint `/ws` and its destinations: `/app/chat.sendMessage`, `/app/presence`, `/app/rooms/{roomId}/typing`,
  `/topic/rooms/{roomId}`, `/topic/rooms/{roomId}/typing`, `/topic/presence`, `/user/queue/errors`; backend interceptors and services behind them;
  `StompProvider`, `stompSession`, `useWebSocket`, `useRoomMessage` on the frontend.
- Source: review session of 2026-10-12 (code read only, compared with common chat-app practice). Specs: SPEC-004, SPEC-005, SPEC-007, SPEC-008;
  design: `websocket-protocol.md`; ADR-0003, ADR-0004.
- Status: **Triaged 2026-10-12.** CM-TBD-W1 is folded into CM-068 (D-12), CM-TBD-W2 into CM-067 (D-15), CM-TBD-W3 is v1 (D-14); see `docs/plan/MVP_V0_PLAN.md`. The `Tests run: 0` item is resolved (D-19). No code was changed and no tests were run by this review.
- Per `AGENTS.md`, this document does not edit any Approved spec. Items that change a spec or an existing ticket are listed as decisions (section 5).
- Most findings from this review were **already tracked** (section 3). Only section 2 and section 4 are new work.

## 1. Verdict and flow summary

For an MVP on a single backend instance the design is sound and stronger than most hobby chat apps on authorization. The gaps are delivery
reliability and horizontal scaling, and both are already recorded as known limits.

Flow, as read from code:

```text
Connect   POST /api/v1/auth/ws-token (session cookie) -> Redis ws-token:<t>, TTL 60 s, single use (WsTokenService, GETDEL)
          WS /ws (origin = app.client.url) -> STOMP CONNECT with X-WS-Token -> AuthChannelInterceptor consumes it, sets Principal
          SessionConnectedEvent -> PresenceEventListener -> PresenceService (Redis registry) and RoomSubscriptionInterceptor (session -> user)
SEND      AuthChannelInterceptor: only /app/chat.sendMessage, /app/presence, /app/rooms/*/typing; others -> AccessDenied
          WsRateLimitInterceptor: chat 10/5 s, typing 10/5 s (one bucket for all rooms), presence 20/60 s; over limit = drop, not close
          chat: ChatWebSocketController -> MessageService (user exists, participant check, save) -> broadcast /topic/rooms/{id}
          typing: TypingController (participant check; roomId and userId set from route and Principal) -> /topic/rooms/{id}/typing
          presence: PresenceWebSocketController -> PresenceService.heartbeat (refresh only; payload ignored)
SUBSCRIBE AuthChannelInterceptor: room topics need membership; /topic/presence and /user/queue/errors need only authentication
DELIVERY  RoomSubscriptionInterceptor.beforeHandle: membership re-checked in Mongo for every outbound room frame (no cache), fail closed
PRESENCE  online/offline comes from connect/disconnect events and the Lua registry (presence-registry.lua), which PUBLISHes
          presence-channel; RedisPresenceSubscriber forwards to /topic/presence
```

## 2. New findings (not in any existing plan file)

| ID | Severity | Location | Finding |
|---|---|---|---|
| W-1 | High | `useRoomMessage.ts` (`resendMessage`, `createOptimisticMessage`) vs `MVP_V0_PLAN.md` CM-068 | CM-068 derives `clientMessageId` "from the existing `tempId`". But Resend builds a **new** optimistic message with a new `tempId` (`temp-${Date.now()}-${Math.random()}`) and replaces the failed copy. So a Resend after a timeout where the server did save the first copy sends a different id, the unique index does not match, and the message is stored twice. CM-068 as written only dedupes a redelivered frame, not a user Resend. This is the exact case in U-2 / B-1. |
| W-2 | Medium | `ChatWebSocketController.sendMessage` (`:40-50`) | Persist and broadcast share one `try`. If `convertAndSend` throws after `messageService.sendMessage` saved the message, the sender gets `INTERNAL_ERROR` "Failed to send message" although the message exists in Mongo. The CM-003 audit already notes that `INTERNAL_ERROR` does not prove the message was not saved (`CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md:214`) but no ticket separates the two steps. Combined with W-1 this produces a visible duplicate. |
| W-3 | Low | `backend/README.md:56` | Says `/app/presence`: "Update presence status". The server ignores the payload; it only refreshes the heartbeat of a known session. `websocket-protocol.md:44` and `:308` are correct. Anyone reading the README (including the table that prompted this review) will believe `online:false` marks the user offline. |
| W-4 | Low | `service/RedisPresencePublisher.java`, `config/RedisConfig.java` | `publishPresenceUpdate` has no caller in `backend/src/main`. The Lua registry publishes `presence-channel` itself. The class only survives because `RedisConfig` imports its `PRESENCE_CHANNEL` constant, and `RedisPresencePublisherTest` keeps it alive. Dead code that suggests a second publisher path exists. |
| W-5 | Info | `WsRateLimitInterceptor` | Typing shares one bucket per user across all rooms (documented in the code comment). Typing in room A spends room B's quota. Acceptable for v0; note it if multi-room typing is ever added. |

Not defects, recorded so they are not rediscovered:

- The 30 s `/app/presence` beat from every tab is not strictly needed (`PresenceService.refresh` runs on a 15 s timer). Already U-9.
- `ChatWebSocketController` catches `Exception`, which `AGENTS.md` forbids in services. Already recommended in `AUDIT_REPORT.md` (#"ChatMeeException hierarchy").

## 3. Already tracked: do not re-open

| My finding | Existing ID | Where | State |
|---|---|---|---|
| Resend / retry can duplicate a message | B-1, U-2 | `REVIEW_MESSAGES_PRESENCE.md`; CM-068 | Planned, but see W-1 |
| Presence is global and visible to every user; scan of whole `online` set | B-2, AC-005-4 | `REVIEW_MESSAGES_PRESENCE.md`; `V1_BACKLOG.md` | Owner decision: room-scoped presence is v1+ |
| Initial presence snapshot is never loaded; events missed on reconnect | U-1, U-8 | `REVIEW_MESSAGES_PRESENCE.md` CM-TBD-1 | Proposed, P0 |
| Gap longer than one page after a disconnect (resync only refetches the newest page) | B-10 | `REVIEW_MESSAGES_PRESENCE.md` | Known; revisit with B-3 |
| Ordering by app-side `Instant.now()` and random UUID across instances | B-3 | `REVIEW_MESSAGES_PRESENCE.md` | Decision needed before cross-instance fan-out |
| Two Mongo reads per recipient per frame on a 4-16 thread outbound executor | M1 (CM-058 review) | `BOARD.md` | Load-test first, then cache or skip typing frames |
| Room messages are not fanned out across instances (simple broker) | scope | `V1_BACKLOG.md`, `websocket-protocol.md:141-144` | v1 |
| Logout / session expiry does not close open sockets; ws-token not revocable | WS-A02..A04 | CM-003 audit; `V1_BACKLOG.md` | v1 with ADR |
| First frames after a pipelined SUBSCRIBE may be dropped | L2 (CM-058 review) | `BOARD.md` | Covered by CM-068 ordering AC |
| Typing indicator has no receiver-side expiry | U-4 | `REVIEW_MESSAGES_PRESENCE.md` CM-TBD-3 | Proposed, P1 |
| Reconnect backoff, 401 loop | F-4, WS-A09 | `REVIEW_AUTH_USERS.md`; CM-068 | Planned |

Reconnect resync does exist on the frontend: `useRoomMessage` refetches the newest page on `onReconnect` and merges by id
(`mergeResyncedMessages`), and `matchResyncedPending` confirms pending messages saved with a lost echo. An earlier statement in this review that
reconnect had no catch-up was wrong; the remaining gap is B-10 only.

## 4. Draft tickets

### CM-TBD-W1: Stable client message id across Resend, and persist/broadcast split
- Type: fix · Spec: SPEC-004 (AC-004-3), SPEC-008 (AC-008-13) · Design: `websocket-protocol.md` · Priority: P0 · Estimate: S
- Depends on: none if folded into CM-068; otherwise CM-068

**Goal.** A user Resend of a message the server already saved shows and stores it once, and a broadcast failure after a successful save no
longer reports the send as failed.

**Scope.**
- In: `resendMessage` reuses the failed message's `tempId` (which CM-068 stores as `clientMessageId`) instead of creating a new one;
  `messageReducer` `RESEND_MESSAGE` keeps that id; `ChatWebSocketController` moves `convertAndSend` out of the persist `try` so a broadcast
  failure is logged and does not send `INTERNAL_ERROR` to the sender (the stored message reaches the room on the next resync); tests.
- Out: ordering decision (B-3), cross-instance fan-out, STOMP RECEIPT.

**Expected files.** `frontend/hooks/useRoomMessage.ts`, `frontend/hooks/reducers/messageReducer.ts`, `frontend/lib/utils/messageUtils.ts`,
`backend/.../controller/ChatWebSocketController.java`, tests next to each; `docs/design/websocket-protocol.md` (state that Resend reuses the id).

**Acceptance criteria.**
- [ ] Given a message saved but unconfirmed, when the user presses Resend, then history contains it once and the pending copy resolves -> `useRoomMessage` / `messageReducer.test.ts`, `MessageServiceTest` (same `clientMessageId` twice)
- [ ] Given `convertAndSend` throws after save, then the sender receives no `INTERNAL_ERROR` and the failure is logged without message content -> `ChatWebSocketControllerTest`
- [ ] A tempId is still unique per new message (two sends produce two ids) -> `useRoomMessage` test
- [ ] `./mvnw verify` and `npm run lint && npx tsc --noEmit && npm test && npm run build` are green

**Notes.** Prefer amending CM-068 over a new ticket (owner decision 5.1). If the broadcast is removed from the `try`, keep the generic
`INTERNAL_ERROR` path for real save failures.

### CM-TBD-W2: Correct the `/app/presence` description in backend README
- Type: docs · Priority: P2 · Estimate: S · Fold into CM-067 (release docs) if preferred.
- Change `backend/README.md:56` to say it refreshes the heartbeat of the caller's known session, the payload is ignored, and online/offline
  follows connect/disconnect. Link `websocket-protocol.md` section on presence. Check `README.md` and `docs/specs/SPEC-005-presence-typing.md`
  for the same wording.
- AC: [ ] the README matches `websocket-protocol.md:44` and `:308`.

### CM-TBD-W3: Remove the dead presence publisher
- Type: refactor · Priority: P2 · Estimate: S · Depends on: confirming `PresenceRegistryIT` (needs Docker) is green first.
- Move `PRESENCE_CHANNEL` next to `RedisConfig` (or a small constant holder), delete `RedisPresencePublisher` and `RedisPresencePublisherTest`.
  Keep `RedisPresenceSubscriber`. The Lua script keeps publishing the channel name; do not change the string.
- AC: [ ] no class named `*PresencePublisher` remains; [ ] `PresenceRegistryIT` and `RedisPresenceSubscriberTest` still pass;
  [ ] `./mvnw verify` green. Do not add a new publisher path.

## 5. Decisions needed from the owner

1. W-1: amend CM-068 (recommended: it already adds the field and the index, the frontend change is two files) or ship CM-068 as written and
   add CM-TBD-W1 later. Shipping CM-068 unchanged leaves U-2 open.
2. W-2: accept that after a broadcast failure the sender sees a normal pending message that resolves on the next resync, or add an explicit
   retry of the broadcast (not recommended for v0).
3. W-4: delete the dead publisher in v0, or leave it until the v1 presence rework (B-2) rewrites that area.

## 6. Verification still owed

These were read but not executed. Run before relying on the statements in section 1.

- `./mvnw verify` with Docker (`PresenceRegistryIT`, `StompMessagingIT`, `SubscriptionRevocationIT`, `WsRateLimitIT`).
- Interceptor order on `clientInboundChannel`: `AuthChannelInterceptor` (registered in `WebSocketConfig`) and `WsRateLimitInterceptor`
  (registered in `WsRateLimitConfig`) come from two configurers. The rate limiter lets frames without a Principal through, so the outcome is safe
  either way, but the real order was not confirmed. A test asserting it would also cover CM-068's `setPreserveReceiveOrder(true)`.
- `WsTokenServiceTest` and `AuthChannelInterceptorTest` report `Tests run: 0` (see `REVIEW_AUTH_USERS.md` section 1); re-run them alone.
- Load: per-recipient membership reads (M1) in a room of about 100 members with typing active. No measurement exists.
- Behaviour of a socket after logout or session expiry (WS-A02..A04): the principal is fixed at CONNECT and no disconnect hook was found.
  This is a known v1 gap; confirm it matches the README security model before the v0 release (CM-067).
