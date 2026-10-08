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

## Message delivery (CM-029)

For `/app/chat.sendMessage`, the controller validates the payload, resolves the
Principal's stored identity, and checks room membership. It then calls
`MessageService.persistMessage` synchronously. Only after the repository returns
successfully does it broadcast the saved message to `/topic/public/{roomId}`.
The payload uses the saved `id`, `createdAt`, and `updatedAt`, plus the original
`tempId`. Database failure sends `{tempId, message}` to the sender's
`/user/queue/errors` and produces no room broadcast. There is no background
message persistence executor. This is not an exactly-once delivery guarantee:
a disconnect or broker failure after saving can still prevent confirmation.

Message entity and response timestamps are `Instant`; JSON timestamps are
ISO-8601 UTC strings ending in `Z`. Join announcements use the same timestamp
format. The response flags are exactly `isUpdated` and `isDeleted`.
`MessageList` parses the ISO string with `new Date(createdAt)` and the interface
formats that Date with local `toLocaleTimeString` / `toLocaleDateString`.

Each optimistic send has its own 10-second confirmation timer. A private error,
local publish failure, or timeout marks that message `failed`; confirmation marks
it `sent` (including a late confirmation after timeout). Confirmation and errors
clear that message's timer; room changes and unmount clear all pending timers.
Pending messages do not disable the input or send button. Error subscriptions
are removed with room subscription cleanup so the next room receives errors.

### Stored timestamp compatibility

Default Spring Data Mongo mapping previously stored `LocalDateTime` as BSON
Date, using the JVM's default zone when converting to UTC. Those BSON dates
remain readable as `Instant`, preserving the stored point in time. Existing
ISO strings with `Z` also read successfully. Offset-free strings such as
`2026-10-08T12:34:56` cannot be converted to `Instant` by the default converter.
No production data was inspected and no migration was run. If an inventory
finds those strings, migrate them separately only after establishing the original
writer's timezone; do not guess UTC or apply a blanket seven-hour adjustment.
BSON Date retains millisecond precision; JSON Instant can retain nanoseconds.

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

CM-029 regression coverage:
- `ChatWebSocketControllerAuthTest`: Mockito InOrder proves save before broadcast,
  saved ID/timestamp propagation, and private error without broadcast on save failure.
- `MessageServiceTest`: synchronous return/failure, UTC JSON and flag names, legacy
  BSON Date and string timestamp compatibility using the Mongo mapping converter.
- `StompMessagingIT`: real broker payload includes ID, UTC timestamp and frontend
  flags; Mongo already contains the message when the broadcast arrives.
- `messageReducer.test.ts`: pending sends stay enabled; fake-timer hook tests cover
  the 10-second deadline, concurrent sends, confirmations, late confirmation,
  private errors, local failure, room changes, and unmount cleanup.
