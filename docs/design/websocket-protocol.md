# WebSocket protocol and authorization

Implemented by CM-003 (authentication) and CM-004 (authorization). The SockJS
endpoint is `/ws`; application messages use `/app`, broker messages use `/topic`
and `/queue`, and user destinations use `/user`.

## Authentication

An authenticated HTTP session obtains a token from `POST /api/v1/auth/ws-token`.
The client supplies it as the native STOMP `X-WS-Token` header on CONNECT (or the
equivalent STOMP handshake command). Tokens are single-use, expire after 60
seconds, and are consumed atomically from Redis. A fresh token is required for
every reconnect. The interceptor removes the token header after reading it.

The resulting Principal name is the internal `User.id`, never an OAuth provider
ID or a payload field. Missing, invalid, expired, and reused tokens are rejected
with a STOMP ERROR frame followed by connection closure. See
[ADR-0004](../adr/0004-websocket-authentication-token.md).

## Destination matrix

All payloads below are JSON. Directions are relative to the client.

| Destination | Direction / command | Payload | Authorization | Error behavior |
|---|---|---|---|---|
| `/app/chat.sendMessage` | Client to server / SEND | `{roomId, content, messageType, tempId?}` | Authenticated Principal; member of payload room | Validation, membership, and synchronous processing errors go to the Principal's `/user/queue/errors`; validation/membership rejection prevents publication and persistence |
| `/app/chat.addUser` | Client to server / SEND | `{roomId, content, messageType, tempId?}` | Authenticated Principal; existing member of payload room; this announces a join and does not grant membership | Validation, membership, and synchronous processing errors go to the Principal's `/user/queue/errors` |
| `/app/typing` | Client to server / SEND | `{roomId, typing}`; legacy `userId` is ignored | Authenticated Principal; member of payload room | Nonmembers and missing/blank room IDs are dropped without a broadcast |
| `/app/presence` | Client to server / SEND | `{online}`; legacy `userId` is ignored | Any authenticated Principal; only its own presence changes | Missing Principal is rejected by the interceptor; no other user's presence can be changed |
| `/topic/public/{roomId}` | Server to client / SUBSCRIBE | `ChatMessageResponse`: server message ID, optional tempId, chatRoomId, senderId, senderName, content, type, timestamps, update/delete flags | Member of the exact room | Unauthorized SUBSCRIBE receives STOMP ERROR and connection closure |
| `/topic/typing/{roomId}` | Server to client / SUBSCRIBE | `{roomId, userId, typing}`; server supplies userId | Member of the exact room | Unauthorized SUBSCRIBE receives STOMP ERROR and connection closure |
| `/topic/presence` | Server to client / SUBSCRIBE | `{userId, online}`; server supplies userId | Any authenticated Principal | Missing Principal receives STOMP ERROR and connection closure |
| `/user/queue/errors` | Server to client / SUBSCRIBE | `{tempId?, message}` (`StompError`) | Any authenticated Principal, for its own user destination | Application errors are private to that Principal; never sent to a room topic |

## Authorization rules

- SUBSCRIBE and SEND require an authenticated Principal with a nonblank name.
- Room membership comes from the `participants` collection (decision D4), through
  `ParticipantService.isUserParticipant(roomId, userId)`. It does not come from
  `ChatRoom.participants` or client identity fields.
- Room subscriptions accept exactly one nonblank room-ID path segment after
  `/topic/public/` or `/topic/typing/`. Empty IDs and nested paths are denied.
- Subscription destinations are an allowlist: only the four subscription forms
  above are accepted. All other destinations, including raw `/queue/**`, other
  users' `/user/**` paths, and unknown `/topic/**`, are denied.
- SEND destinations are an allowlist: only the four `/app/**` destinations above
  are accepted. Direct SEND to `/topic/**`, `/queue/**`, or `/user/**` is denied
  so clients cannot bypass controller authorization or impersonate the server.
- Chat and typing handlers check membership against the Principal's ID on every
  SEND. Subscription membership is checked when SUBSCRIBE is processed;
  revoking an already-active subscription after membership removal is not
  implemented in this ticket.
- Chat identity is resolved from the Principal and stored User record. Presence
  and typing overwrite payload userId with the Principal's ID before broadcasting;
  response shapes remain compatible with existing clients.
- Chat errors use
  `convertAndSendToUser(principal.getName(), "/queue/errors", error)`. The broker
  serves `/queue`, and `/user` routing resolves each user's subscriptions. All
  subscribed sessions for the same Principal can receive that user's error;
  other users cannot. The former shared room error topic has been removed.
- Interceptor authentication/authorization failures are protocol errors and close
  the connection. They are distinct from controller errors delivered to the user
  queue. Clients reconnect with a fresh token after protocol rejection.

## REST presence and limits

`GET /api/v1/online-users` remains available under the existing authenticated API
security policy. `POST /api/v1/presence/offline` has been removed; the frontend
does not use it. Explicit STOMP presence reports can affect only the authenticated
user; session connect/disconnect events also drive presence.

Real Redis/Mongo integration and a cross-user room subscription scenario belong
to CM-023. The in-process wire tests here use the real broker/interceptor and
mocked services. Existing origin, logging, CSRF, and distributed presence concerns
remain for CM-010 and CM-043. Destination renaming belongs to CM-042; current room
topic names are retained for compatibility.

## Regression coverage

- `AuthChannelInterceptorTest`: CONNECT token checks; room membership; allowed
  presence/user-error subscriptions; default denial; missing Principal; SEND
  allowlist; in-process rejection of user B subscribing to room A; two-user
  private error routing through the real broker.
- `ChatWebSocketControllerAuthTest`: Principal-derived chat identity, membership
  rejection, and processing errors sent only to the sender's queue.
- `ChatWebSocketControllerValidationTest`: invalid chat/join payloads send private
  errors without persistence or room broadcasts; valid boundary payload succeeds.
- `TypingControllerTest`: forged/omitted identity, membership rejection, missing
  Principal, and missing room.
- `PresenceWebSocketControllerTest`: forged online/offline identity, omitted
  identity, and missing Principal.
- `PresenceRestControllerTest`: offline POST mapping removed and online GET kept.
