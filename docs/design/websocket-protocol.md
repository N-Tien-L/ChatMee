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
| `/app/chat.sendMessage` | Client to server / SEND | `{roomId, content, messageType: "TEXT", tempId?}` | Authenticated Principal; member of payload room; at most 10 frames per 5 s per user; only `TEXT` is accepted (SYSTEM messages are server-generated) | Validation, membership, and synchronous processing errors go to `/user/queue/errors` of the sending STOMP session only; validation/membership rejection prevents publication and persistence |
| `/app/rooms/{roomId}/typing` | Client to server / SEND | `{typing}`; roomId comes from the path, any `userId` is ignored | Authenticated Principal; member of payload room | Nonmembers and missing/blank room IDs are dropped without a broadcast |
| `/app/presence` | Client to server / SEND | `{online}`; legacy `userId` is ignored | Any authenticated Principal; heartbeat for its known session only | Missing Principal is rejected by the interceptor; `online` and `userId` are ignored |
| `/topic/rooms/{roomId}` | Server to client / SUBSCRIBE | `ChatMessageResponse`: server message ID, optional tempId, chatRoomId, senderId, senderName, content, type, timestamps, update/delete flags | Member of the exact room | Unauthorized SUBSCRIBE receives STOMP ERROR and connection closure |
| `/topic/rooms/{roomId}/typing` | Server to client / SUBSCRIBE | `{roomId, userId, typing}`; server supplies userId | Member of the exact room | Unauthorized SUBSCRIBE receives STOMP ERROR and connection closure |
| `/topic/presence` | Server to client / SUBSCRIBE | `{userId, online}`; server supplies userId | Any authenticated Principal | Missing Principal receives STOMP ERROR and connection closure |
| `/user/queue/errors` | Server to client / SUBSCRIBE | `{tempId?, code, message}` (`StompError`; `code` is an `ErrorCode` name such as `VALIDATION_FAILED`, `FORBIDDEN_ACTION`, `RATE_LIMITED`, `INTERNAL_ERROR`) | Any authenticated Principal, for its own user destination | Errors are sent only to the STOMP session that sent the failing frame (`simpSessionId`); other sessions of the same user do not receive them. Never sent to a room topic |

## Message delivery (CM-029)

For `/app/chat.sendMessage`, the controller validates the payload, resolves the
Principal's stored identity, and checks room membership. It then calls
`MessageService.persistMessage` synchronously. Only after the repository returns
successfully does it broadcast the saved message to `/topic/rooms/{roomId}`.
The payload uses the saved `id`, `createdAt`, and `updatedAt`, plus the original
`tempId` and the stored `clientMessageId` (the same value; `clientMessageId` is
also in history). Database failure sends `{tempId, message}` to the sender's
`/user/queue/errors` and produces no room broadcast. There is no background
message persistence executor.

Idempotency (CM-068, SPEC-008 AC-008-13): a message stored with a `tempId` is
keyed by `(chatRoomId, senderId, clientMessageId)` in a unique partial index
(`messages_room_sender_client`, see `data-model.md`). A repeated send with the
same `tempId` from the same sender in the same room does not store a second row:
the stored message is returned and broadcast again. A client Resend reuses the
failed message's `tempId`. A broadcast failure after a successful save is logged
without message content and sends no `INTERNAL_ERROR`; the sender sees the
message on the next resync. This is still not an exactly-once delivery
guarantee: a disconnect or broker failure after saving can still prevent confirmation.

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
`ChatMessageResponse` to the existing `/topic/rooms/{roomId}` destination with
`type = SYSTEM`, no `id`/`tempId`, `senderId` = the deleting creator and
`content = "This room has been deleted"`. No new destination is introduced.
Before marking the room inactive, the server snapshots its member user IDs. Only
this terminal broadcast carries that immutable audience in an internal Simp header
(`chatmeeRoomDeletedRecipients`), which the simple broker copies to each recipient.
The header is never a native STOMP header or part of the JSON/client protocol.
This lets the event reach those members' existing subscriptions even though the
room is now inactive and its membership rows have been removed. A subscriber who
left before the snapshot receives no event. Concurrent membership changes follow
the existing nontransactional room lifecycle: the snapshot defines this event's
audience; subscriptions must still exist when the broker processes the broadcast.

Later SUBSCRIBE and SEND frames are denied by the normal membership rule, and
ordinary outbound room/typing frames are dropped server-side (CM-058). Since
CM-045 the client also removes the room from its list on the SYSTEM event, which
unmounts the room view and unsubscribes its topics.

### Existing subscription revocation (CM-058)

Option A is implemented by `RoomSubscriptionInterceptor` on `clientOutboundChannel`.
It uses `ExecutorChannelInterceptor.beforeHandle`, so authorization happens after
executor queuing, just before each transport handler receives a MESSAGE. Returning
null drops only that recipient's frame; it sends no ERROR and closes no connection.
Broker registrations stay until the client unsubscribes/disconnects. If a user
later rejoins, the old subscription can receive frames again under the live guard.

Authenticated `SessionConnectedEvent` and `SessionDisconnectEvent` maintain an
instance-local session-ID to internal-user-ID map. The receiver comes from the
outbound `simpSessionId`, never a sender Principal or payload. Missing receiver
identity, malformed room topics and membership database errors fail closed.
Presence, private error queues, heartbeats and other control frames pass through.

Every ordinary MESSAGE for `/topic/rooms/{roomId}` or its `/typing` topic calls
`ParticipantService.isUserParticipant`, requiring an active room and a membership
row. There is **no membership cache** (cache staleness bound: zero), so leaving
blocks the next delivery check on every open session without eviction hooks.
Messages waiting in the outbound executor are checked when handled. Frames already
accepted by the WebSocket transport before a concurrent leave/delete cannot be
recalled from its buffers or the network.

**Multiple instances:** a REST leave/delete on instance A changes shared MongoDB;
instance B's next outbound check reads that change directly, assuming the existing
primary-read configuration. No Redis revocation fan-out or TTL is needed. Database
unavailability drops room frames rather than extending an old grant. The cost is
up to two Mongo reads per recipient/frame; load measurements are a follow-up before
introducing any positive membership cache and its explicit staleness tradeoff.

The existing simple broker and room-deleted broadcast are instance-local; CM-043
fans out presence, not room messages. This change revokes delivery on remote socket
instances but does not introduce distributed room-event delivery. Reliable room
and terminal-event fan-out across instances remains a separate follow-up.

Spring contracts covered by the new tests: the actual executor channel invokes
`beforeHandle` at handler time; the wire integration tests obtain receiving identity
from real connection events and preserve the internal deletion audience through
the real broker without changing the client payload. Execution is delegated to
the orchestrator's `./mvnw verify` gate for this ticket.

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
  `/topic/rooms/` (`{roomId}` for messages, `{roomId}/typing` for typing). Empty IDs and nested paths are denied.
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
  uses authenticated session identity; typing overwrites payload userId with the Principal's ID before broadcasting;
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
| `/app/rooms/{roomId}/typing` | 10 per 5 s per user, shared across rooms | Frame dropped silently |
| `/app/presence` | 20 per 60 s | Frame dropped silently |

Frames are dropped, not rejected with an exception, because an exception would close
the whole STOMP connection. Like the HTTP limiter, it fails open when Redis is down.

## REST presence and limits

`GET /api/v1/online-users` remains available under the existing authenticated API
security policy. `POST /api/v1/presence/offline` has been removed; the frontend
does not use it. STOMP presence reports are heartbeats for known authenticated sessions. Both
`online` and legacy `userId` are ignored, including the logout `{online:false}`
report. Only session connect/disconnect and expired instance leases drive presence.

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
- `PresenceWebSocketControllerTest`: online/offline flags cannot change presence,
  forged/omitted identity refreshes only the Principal session, and missing Principal.
- `PresenceRestControllerTest`: offline POST mapping removed and online GET kept.
- `SubscriptionRevocationIT`: REST leave/delete with live STOMP subscribers,
  two sessions per member, deletion SYSTEM event followed by silence, unaffected
  members/rooms/presence/private errors, and shared-database removal without a
  local invalidation hook (CM-058).
- `RoomSubscriptionInterceptorTest`: receiver identity, every-frame authorization,
  session cleanup, database failure, server-only deletion exception and queued-frame
  filtering through an actual `ExecutorSubscribableChannel` (CM-058).

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


## Shared presence registry (CM-043)

An authenticated session is registered by instance ID and STOMP session ID. A user
stays online while any session on any instance is alive. Closing the last session
starts a 10 s Redis grace deadline; reconnect cancels it, avoiding reload flicker.
Instance leases refresh every 15 s and expire after 45 s; expired owners are pruned
by snapshot refresh, a 15 s sweep, and on GET. The last-tab offline event arrives
10-25 s after closure because the 10 s grace deadline is checked periodically.
Idle sweeps check pending once inside the script and skip full work when empty;
refresh still detects crashed peers even without local sessions. Only state transitions are published to `presence-channel`
and each Redis subscriber forwards the same `{userId, online}` shape to its local
`/topic/presence`. Subscriber delivery never writes back into the registry.

`GET /api/v1/online-users` reads the shared registry, including users in grace.
`/app/presence {online}` only refreshes a session known locally from authenticated
CONNECT. It cannot create a session, set offline, or broadcast a payload. The
existing 20 per 60 s rate limit remains. Redis outages fail open with local reads;
shared correctness resumes on snapshot reconciliation. See ADR-0002's amendment
for keys, configuration, recovery and failure bounds. Global presence visibility
remains an open question under SPEC-005 AC-005-4.

Tests: `PresenceRegistryIT` (two instances, concurrent tabs, reconnect grace, expired
leases, recovery reconciliation), `PresenceServiceTest` (immutable shared reads,
fail-open local sessions, unknown heartbeat rejection), `PresenceEventListenerTest`
(authenticated session identity), `PresenceWebSocketControllerTest` (ignored flags),
`RedisPresenceSubscriberTest` (fan-out without registry writes).

CM-068 regression coverage:
- `MessageServiceTest`: a repeated client id stores one row and returns the stored message; a duplicate without a client id is an error.
- `MessageRepositoryIT`: the unique partial index exists; a duplicate row is rejected; eight concurrent duplicates store one row.
- `ChatWebSocketControllerTest`: a broadcast failure after the save sends no `INTERNAL_ERROR`.
- `ChatWebSocketControllerAuthTest`, `ChatWebSocketControllerValidationTest`, `WsRateLimitInterceptorTest`: private errors target the originating session.
- `StompMessagingIT`: two sessions of one user; CONNECT while Redis is unavailable gets an ERROR without the token.
- `AuthChannelInterceptorTest`: Redis unavailable rejects CONNECT without the token or a chained cause.
- `stompSession.test.ts`: 401 from the token request stops retries; jitter stays within the capped backoff.
- `messageUtils.resync.test.ts`, `useRoomMessage.test.ts`, `messageReducer.resend.test.ts`: resync matches by client id; Resend reuses the id; new sends get distinct ids.

## Per-user events (SPEC-008 AC-008-1, CM-060 implemented)
CM-060 implements the queue, create/PUBLIC join, leave/delete, editable room updates and non-SYSTEM activity.
CM-062 implements member listing/removal and persisted join/leave/removal SYSTEM announcements.
CM-061 implements activity/read fields in `ChatRoomResponse` and shares the saved-message summary with `ROOM_ACTIVITY`.
SPEC-009 extensions remain with the later tickets in the table.
New DMs notify both initial members with their respective room views. Unchanged name/description/capacity emits no update event.
Delivery failures log metadata only and do not stop other recipients; clients recover missed events by refetching after reconnect.
CM-061 also isolates activity-update and recipient-lookup failures after persistence: they do not fail the saved message send.
Destination `/user/queue/events`, server to client, SUBSCRIBE by any authenticated Principal for its own user destination. The
`/user/queue/*` SUBSCRIBE allowlist becomes exactly `/user/queue/events` and `/user/queue/errors`. Events go to **every** session of the
user (`convertAndSendToUser`), unlike private errors (see below). Events are not replayed: after a reconnect the client refetches
`GET /api/v1/rooms` and `GET /api/v1/online-users`.

Envelope: `{type, payload, occurredAt}` (`occurredAt` ISO-8601 UTC). `room` is the same `ChatRoomResponse` that `GET /rooms` returns for
that user (with `myRole`, `unreadCount`, `lastMessage`, `state`, `blocked`).

| `type` | `payload` | To | Sent when | Ticket |
|---|---|---|---|---|
| `ROOM_ADDED` | `{room}` | the user who entered | create, PUBLIC join, invitation accepted, DM request accepted (recipient) | CM-060, CM-070, CM-072 |
| `ROOM_REMOVED` | `{roomId, reason}`; `reason` = `LEFT` \| `REMOVED` \| `DELETED` \| `HIDDEN` \| `DECLINED` \| `EXPIRED` | the affected user | leave; removed by owner/admin; room deleted (every member); DM hidden (caller's other sessions); DM request declined or expired (sender) | CM-060, CM-062, CM-072, CM-075 |
| `ROOM_UPDATED` | `{room}` | every member, or only the affected user | name/description/capacity change (all members); role change or owner transfer (affected user); DM request accepted (sender) | CM-060, CM-072, CM-076 |
| `ROOM_ACTIVITY` | `{roomId, lastMessage: {id, senderId, senderName, preview, createdAt}}` | every member, after persist | non-SYSTEM message persisted; `preview` <= 100 chars; a member whose `hiddenAt` is cleared by this message receives it too | CM-060, CM-061 (shared persisted summary), CM-075 |
| `INVITATION_RECEIVED` | `{invitation: {id, room: {id, name, memberCount}, inviter: {id, name, avatarUrl}, createdAt, expiresAt}}` | invitee | invitation created | CM-070 |
| `INVITATION_CHANGED` | `{invitationId, roomId, status}` | invitee and inviter | accepted, declined, revoked | CM-070 |
| `DM_REQUEST_RECEIVED` | `{request: {roomId, sender: {id, name, avatarUrl}, preview, createdAt, expiresAt}}` | recipient (not when a block exists) | DM request created; `preview` is updated by the one allowed message with a second `DM_REQUEST_RECEIVED` for the same `roomId` (client upserts by `roomId`) | CM-072 |

Rules:
- An event for a room that is not in the client's list makes the client fetch `GET /api/v1/rooms/{id}` once and insert it.
- Logs never contain `preview` or message content.
- Publishing goes through one `UserEventPublisher` service so every event type has one place and one test.
- Cost: one `ROOM_ACTIVITY` per member per message. Accepted for v0; measure before v1 (rooms up to 1000 members).

## Private errors, ordering and connection setup (SPEC-008 AC-008-13..16, CM-068)
- Implemented: `/user/queue/errors` is delivered only to the STOMP session that sent the failing frame (a `simpSessionId` header on
  `convertAndSendToUser`), in `ChatWebSocketController` and `WsRateLimitInterceptor`. `/user/queue/events` stays user-wide.
- Implemented: `/app/chat.sendMessage` idempotency and the persist/broadcast split (see Message delivery above).
- Implemented: CONNECT while Redis is unavailable gets a STOMP ERROR `WebSocket authentication unavailable`. The Redis exception is not
  chained, so neither the token nor the Redis detail reaches the frame or the log (fail closed).
- Implemented: a socket that never sends CONNECT is closed after 60 s (`WebSocketTransportRegistration.setTimeToFirstMessage(60000)`, equal to
  the Spring default, set explicitly).
- **Not implemented (blocked, CM-068): inbound ordering.** `setPreserveReceiveOrder(true)` on the STOMP endpoint registry wraps each session's
  inbound channel in `OrderedMessageChannelDecorator` (Spring 7.0.9). That decorator logs and drops any exception from the inbound
  interceptors, so CONNECT rejections and denied SUBSCRIBE frames lose their ERROR frame and the connection close. Measured in
  `AuthChannelInterceptorTest$WireConnect` and `StompMessagingIT`. Until this is resolved, a SUBSCRIBE sent right before a SEND can still
  be processed out of order (WS-A14). Options are in the CM-068 report; the owner decides.

New STOMP error codes (SPEC-009): `DM_REQUEST_PENDING` (second message in a REQUESTED DM by the sender), `FORBIDDEN_ACTION` with the
generic message "Cannot message this user" (block). Both go to `/user/queue/errors` of the sending session.

## REST endpoints added in v0 (summary)
Full contracts are in the specs and in OpenAPI (`/v3/api-docs`, dev/local).

| Method and path | Spec | Ticket |
|---|---|---|
| `PUT /api/v1/rooms/{roomId}/members/me/read` | AC-008-3: caller-only marker, 204; non-member or inactive room 404 | CM-061 implemented |
| `GET /api/v1/rooms/{roomId}/members` | AC-008-5: member data batched in two queries, plus active-room authorization | CM-062 implemented |
| `DELETE /api/v1/rooms/{roomId}/members/{userId}` | AC-008-6: 204; OWNER removes others, ADMIN removes MEMBER; DMs 403; unknown member/non-member caller 404 | CM-062 implemented |
| `POST /api/v1/rooms/{roomId}/invitations`, `GET /api/v1/rooms/{roomId}/invitations` | AC-009-1, -3 | CM-070 |
| `GET /api/v1/invitations`, `POST /api/v1/invitations/{id}/accept`, `POST .../decline`, `DELETE /api/v1/invitations/{id}` | AC-009-2, -3 | CM-070 |
| removed: `POST /api/v1/rooms/{roomId}/members` | AC-009-5 | CM-070 |
| `GET /api/v1/dm-requests`, `POST /api/v1/rooms/{roomId}/dm-request/accept`, `POST .../dm-request/decline` | AC-009-11, -12 | CM-072 |
| `PUT` / `DELETE /api/v1/users/{userId}/block`, `GET /api/v1/users/me/blocks` | AC-009-15 | CM-073 |
| `POST /api/v1/reports` | AC-009-20 | CM-074 |
| `POST /api/v1/rooms/{roomId}/hide` | AC-009-21 | CM-075 |
| `PATCH /api/v1/rooms/{roomId}/members/{userId}/role` | AC-009-23 | CM-076 |

## Role changes and owner transfer (CM-076 implemented)

`PATCH /api/v1/rooms/{roomId}/members/{userId}/role` (body `{role: ADMIN|MEMBER}`) is owner-only and answers 204. It posts
"A made B an admin" / "A made B a member" as a SYSTEM message, then sends `ROOM_UPDATED` with `myRole` to the affected user only.
When the owner leaves, the successor gets the OWNER role and `ROOM_UPDATED` (AC-009-24), and the SYSTEM message
"B is now the owner" follows the "A left" message. Authorization for update and delete reads the caller's participant role.

## Membership announcements (CM-062 implemented)

Successful group joins (including the shared add-member path), leaves and removals save a SYSTEM
message before broadcasting it on /topic/rooms/{roomId}, with a generated id and UTC timestamps.
Content is "X joined", "X left", or "A removed B". SYSTEM messages never increment unread,
update lastActivityAt/lastMessage, or produce ROOM_ACTIVITY. Missing account names use "Deleted user".
Removal checks participant roles rather than createdBy, deletes the membership and releases its seat,
then sends ROOM_REMOVED with reason REMOVED to all sessions of the removed user. CM-058's existing
live outbound guard blocks subsequent room and typing frames, including the removal announcement,
for that user; their connection and other subscriptions remain usable.
