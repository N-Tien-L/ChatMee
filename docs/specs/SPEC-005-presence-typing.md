# SPEC-005: Presence and typing indicator
- Status: Draft
- Owner: @N-Tien-L · Created: 2026-10-09 · Related: ADR-0002, design/websocket-protocol.md

## 1. Goal
Users see who is online and who is typing in the current room. The server decides presence from authenticated STOMP sessions, so a client cannot fake someone else's state, and presence stays correct with several backend instances.

## 2. Non-goals
- "Last seen" timestamps, invisible mode.

## 3. User stories
- US-1: As a user, I see a green dot next to people who are online.
- US-2: As a member, I see "X is typing…" in the open room.

## 4. Acceptance criteria
- AC-005-1: A user is online while at least one authenticated STOMP session exists, and offline when the last one closes, after a grace period of about 10 s to avoid flicker on reload. -> Partially implemented: connect/disconnect events drive presence, but one closed tab marks the user offline and there is no grace period. Test: `PresenceEventListenerTest#handleWebSocketConnectListener_authenticatedPrincipal_publishesOnline`, `PresenceEventListenerTest#handleWebSocketDisconnectListener_authenticatedPrincipal_publishesOffline`. Planned: CM-043
- AC-005-2: Presence is decided by the server; a client can never report presence for someone else. -> Implemented (the Principal overrides the payload). Test: `PresenceWebSocketControllerTest#handlePresenceEvent_forgedOnlineIdentity_updatesAndBroadcastsPrincipal`. The client can still mark itself online/offline: planned to become a heartbeat in CM-043.
- AC-005-3: With several backend instances, every instance sees the same state (sessions counted in Redis, fan-out through Redis Pub/Sub). -> Partially implemented: transitions go through Redis Pub/Sub, but the online set is per instance. Test: `RedisPresenceSubscriberTest#onMessage_validOnlineMessage_updatesPresenceAndBroadcasts`. Planned: CM-043
- AC-005-4: `GET /presence?userIds=` returns presence only for related users (sharing a room). -> Not implemented: `GET /api/v1/online-users` returns every online id to any authenticated user, and `/topic/presence` is global. Planned: none (see section 9)
- AC-005-5: Typing: SEND `/app/rooms/{id}/typing {typing}`; the server checks membership, takes the user from the Principal and broadcasts on `/topic/rooms/{id}/typing`; the client clears "typing" after 5 s without events; the server throttles typing. -> Implemented with current names (`/app/typing`, `/topic/typing/{roomId}`); throttling is a per-user limit of 10 frames per 5 s (CM-056). Test: `TypingControllerTest#handleTypingEvent_forgedIdentity_broadcastsPrincipalIdentity`, `TypingControllerTest#handleTypingEvent_nonMember_dropsEvent`, `WsRateLimitInterceptorTest#preSend_typingOrPresenceOverLimit_dropsFrameSilently`. Destination rename planned: CM-042

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| Network drops without a DISCONNECT frame | Heartbeat timeout closes the session, then offline | STOMP heartbeat 10 s |
| Several tabs | Online while at least one tab is connected | CM-043 |
| Backend instance crashes | Its sessions expire from the registry | CM-043 |

## 6. Security & Authorization
Typing events require room membership; presence identity comes from the Principal.

## 7. Non-functional
Presence reports are limited to 20 per minute per user (CM-056); presence events log at DEBUG (CM-051b).

## 8. Related APIs / Protocols
docs/design/websocket-protocol.md, docs/adr/0002-redis-for-presence-and-rate-limit.md, OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Should presence be visible only to users who share a room (AC-005-4)? That needs per-user delivery instead of the global `/topic/presence`.
