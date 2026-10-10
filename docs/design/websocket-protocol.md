# WebSocket protocol and authorization

Implemented by CM-003 (authentication) and CM-004 (authorization). The STOMP
endpoint is `/ws`; application messages use `/app`, broker messages use `/topic`
and `/queue`, and user destinations use `/user`.

## Transport and origin (CM-053)

`/ws` is a plain WebSocket endpoint (no SockJS, see the ADR-0003 amendment). The
client connects with `@stomp/stompjs` `brokerURL`, derived from
`NEXT_PUBLIC_WS_URL` by `frontend/lib/realtime/stompClient.ts`: `http://` becomes
`ws://`, `https://` becomes `wss://`, and `ws(s)://` values are used as is. The
browser connects directly to the backend; Vercel rewrites do not proxy `/ws`.

The handshake accepts only the `app.client.url` origin. The endpoint enforces this
itself (`setAllowedOrigins(clientUrl)`, no origin patterns), independent of the
Spring Security CORS filter; a foreign `Origin` gets 403. A handshake without an
`Origin` header (non-browser clients) is treated as same-origin and still needs a
ws-token at CONNECT. `/ws/**` stays CSRF-ignored and `permitAll`: the handshake
carries no cookie-based authority, and STOMP CONNECT authenticates with the
single-use token below.

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
| `/app/chat.sendMessage` | Client to server / SEND | `{roomId, content, messageType: "TEXT", tempId?}` | Authenticated Principal; member of payload room; at most 10 frames per 5 s per user; only `TEXT` is accepted (SYSTEM messages are server-generated) | Validation, membership, and synchronous processing errors go to the Principal's `/user/queue/errors`; validation/membership rejection prevents publication and persistence |
| `/app/typing` | Client to server / SEND | `{roomId, typing}`; legacy `userId` is ignored | Authenticated Principal; member of payload room | Nonmembers and missing/blank room IDs are dropped without a broadcast |
| `/app/presence` | Client to server / SEND | `{online}`; legacy `userId` is ignored | Any authenticated Principal; only its own presence changes | Missing Principal is rejected by the interceptor; no other user's presence can be changed |
| `/topic/public/{roomId}` | Server to client / SUBSCRIBE | `ChatMessageResponse`: server message ID, optional tempId, chatRoomId, senderId, senderName, content, type, timestamps, update/delete flags | Member of the exact room | Unauthorized SUBSCRIBE receives STOMP ERROR and connection closure |
| `/topic/typing/{roomId}` | Server to client / SUBSCRIBE | `{roomId, userId, typing}`; server supplies userId | Member of the exact room | Unauthorized SUBSCRIBE receives STOMP ERROR and connection closure |
| `/topic/presence` | Server to client / SUBSCRIBE | `{userId, online}`; server supplies userId | Any authenticated Principal | Missing Principal receives STOMP ERROR and connection closure |
| `/user/queue/errors` | Server to client / SUBSCRIBE | `{tempId?, code, message}` (`StompError`; `code` is an `ErrorCode` name such as `VALIDATION_FAILED`, `FORBIDDEN_ACTION`, `RATE_LIMITED`, `INTERNAL_ERROR`) | Any authenticated Principal, for its own user destination | Application errors are private to that Principal; never sent to a room topic |

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
Pending messages do not disable the input or send button. Since CM-045 the
session subscribes `/user/queue/errors` once and dispatches each error to the
handlers registered at that moment; a room view removes its handler on cleanup,
so the current room always receives its errors.

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

## Room deleted event (CM-028)

Deleting a room is a soft delete (see `docs/design/data-model.md`). After the room
is marked inactive and its memberships are removed, the server broadcasts one
`ChatMessageResponse` to the existing `/topic/public/{roomId}` destination with
`type = SYSTEM`, no `id`/`tempId`, `senderId` = the deleting creator and
`content = "This room has been deleted"`. No new destination is introduced.
Because the memberships are gone, later SUBSCRIBE and SEND frames for that room are
denied by the normal membership rule. The server does not revoke existing
subscriptions; since CM-045 the client removes the room from its list when it
receives this event, which unmounts the room view and unsubscribes its topics.

## Client (CM-045)

The frontend opens exactly one STOMP connection for the authenticated area.
`frontend/lib/realtime/stompSession.ts` is a framework-free session (client
lifecycle, subscription registry, publish); `StompProvider` mounts it once in
`app/dashboard/layout.tsx`, and `hooks/useWebSocket.ts` is a thin wrapper with
room helpers. No component creates its own client.

- Token: `beforeConnect` fetches a fresh single-use token from
  `POST /api/v1/auth/ws-token` for every connection attempt, including reconnects.
- Registry: subscriptions are kept by destination and handler. Each onConnect
  re-subscribes every destination that still has handlers; one wire subscription
  is shared by all handlers of a destination. Unsubscribe functions stay valid
  across reconnects and release the wire subscription with the last handler.
- Errors: `/user/queue/errors` is subscribed once by the session (see above).
- Reconnect: the stompjs `reconnectDelay` is 0 and the session drives retries
  with exponential backoff (1 s doubling, capped at 30 s) after a socket close,
  an ERROR frame, or a failed token fetch. The backoff resets only after a
  connection stayed up for 10 s, so CONNECT followed by ERROR cannot loop tightly.
- Denied SUBSCRIBE: every SUBSCRIBE carries a `receipt` header; Spring copies it
  to `receipt-id` on the ERROR frame of a denied SUBSCRIBE. The session then stops
  re-subscribing that destination (otherwise each reconnect would be closed
  again) and the provider refreshes the room list.
- Resync: after a reconnect (not the first connect) the open room refetches the
  latest history page through `messageApi` and merges it by message id; server
  copies win, older confirmed messages stay, and pending/failed optimistic
  messages are kept at the end. Cached history of other rooms loaded before the
  reconnect is refetched when the room is opened. Cursor-based catch-up is CM-044.
- Banner: a connection-state banner (`connecting`, `reconnecting`,
  `disconnected` after three failed attempts) is rendered in an
  `aria-live="polite"` region.
- Presence: the provider subscribes `/topic/presence` and reports
  `{online: true}` on each connect and every 30 s; it reports `{online: false}`
  on logout/unmount. The `beforeunload` report was removed; the server derives
  offline from the session disconnect.
- Sends: `/app/chat.sendMessage` always uses `messageType: "TEXT"`. The client no
  longer sends `/app/chat.addUser`; CM-056 removed that destination on the server
  and rejects any other message type with a private `VALIDATION_FAILED` error.

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

## Inbound rate limits (CM-056)

HTTP rate limiting never sees frames on an open socket, so `WsRateLimitInterceptor`
(registered on the clientInboundChannel by `WsRateLimitConfig`) counts SEND frames per
user and destination in Redis, using the same fixed-window `RateLimitingService`:

| Destination | Limit | Over the limit |
|---|---|---|
| `/app/chat.sendMessage` | 10 per 5 s | Frame dropped; private `{tempId, code: "RATE_LIMITED", message}` error |
| `/app/typing` | 10 per 5 s | Frame dropped silently |
| `/app/presence` | 20 per 60 s | Frame dropped silently |

Frames are dropped, not rejected with an exception, because an exception would close
the whole STOMP connection. Like the HTTP limiter, it fails open when Redis is down.

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

CM-053 regression coverage:
- `StompMessagingIT`: the full stack (Security filters included) rejects a handshake
  from a foreign `Origin` with 403 and accepts `app.client.url` through STOMP CONNECT;
  all scenarios use the plain WebSocket transport.
- `AuthChannelInterceptorTest.WireConnect`: without Spring Security filters, the
  endpoint's own origin check still rejects a foreign `Origin` with 403.
- `stompClient.test.ts`: `NEXT_PUBLIC_WS_URL` derivation (http to ws, https to wss,
  ws/wss unchanged).
