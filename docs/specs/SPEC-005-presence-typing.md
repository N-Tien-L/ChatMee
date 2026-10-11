# SPEC-005: Presence and typing indicator
- Status: Draft
- Owner: @N-Tien-L Â· Created: 2026-10-09 Â· Related: ADR-0002, design/websocket-protocol.md

## 1. Goal
Users see who is online and who is typing in the current room. The server decides presence from authenticated STOMP sessions, so a client cannot fake someone else's state, and presence stays correct with several backend instances.

## 2. Non-goals
- "Last seen" timestamps, invisible mode.

## 3. User stories
- US-1: As a user, I see a green dot next to people who are online.
- US-2: As a member, I see "X is typingâ€¦" in the open room.

## 4. Acceptance criteria
- AC-005-1: A user is online while at least one authenticated STOMP session exists, and offline after the last session closes with a 10 s grace period. -> Implemented by CM-043. Tests: `PresenceRegistryIT#sessions_twoInstances_disconnectAndReconnectPublishOnlyTransitions`, `PresenceRegistryIT#sessions_concurrentInstances_preserveAllTabsAndLastSessionGrace`.
- AC-005-2: Presence is decided by the server; a client cannot report presence for someone else or set itself offline. -> Implemented by CM-043. Tests: `PresenceWebSocketControllerTest#handlePresenceEvent_forgedOfflineIdentity_cannotSetOffline`, `PresenceEventListenerTest#handleWebSocketConnectListener_authenticatedPrincipal_registersSession`.
- AC-005-3: All backend instances read shared session state and fan out Redis transitions. -> Implemented by CM-043. Tests: `PresenceRegistryIT#sessions_twoInstances_disconnectAndReconnectPublishOnlyTransitions`, `PresenceRegistryIT#sweep_expiredInstance_prunesSessionsWithoutDisconnect`, `RedisPresenceSubscriberTest#onMessage_validOnlineMessage_forwardsWithoutMutatingRegistry`.
- AC-005-4: `GET /presence?userIds=` returns presence only for related users (sharing a room). -> Not implemented: `GET /api/v1/online-users` returns every online id to any authenticated user, and `/topic/presence` is global. Planned: none (see section 9)
- AC-005-5: Typing: SEND `/app/rooms/{id}/typing {typing}`; the server checks membership, takes the user from the Principal and broadcasts on `/topic/rooms/{id}/typing`; the client clears "typing" after 5 s without events; the server throttles typing. -> Implemented (CM-042): SEND `/app/rooms/{id}/typing`, broadcast on `/topic/rooms/{id}/typing`; throttling is a per-user limit of 10 frames per 5 s across rooms (CM-056). Test: `TypingControllerTest#handleTypingEvent_forgedIdentity_broadcastsPrincipalIdentity`, `TypingControllerTest#handleTypingEvent_nonMember_dropsEvent`, `WsRateLimitInterceptorTest#preSend_typingOrPresenceOverLimit_dropsFrameSilently`.

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

CM-043 executes the presence requirements under the explicit orchestration ticket
authorization while this backfilled spec remains Draft. AC-005-4 remains open;
the full spec is not marked Implemented. Recovery test:
`PresenceRegistryIT#refresh_registryRecovery_removesStaleOwnedSessionsAndRestoresLiveOnes`.
