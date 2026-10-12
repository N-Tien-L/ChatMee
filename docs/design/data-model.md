# Data model: rooms and membership

Status: Implemented (CM-028). Decision record: ADR-0005.

## Collections

| Collection | Document | Key fields | Indexes |
|---|---|---|---|
| `chat_rooms` | `ChatRoom` | `type`, `name`, `createdBy`, `maxParticipants` (`<= 0` = unlimited), `memberCount`, `isActive`, `deletedAt`, `createdAt` (auditing), `lastActivity`, `settings` | `_id` |
| `participants` | `Participant` | `chatRoomId`, `userId`, `role` (OWNER, ADMIN, MEMBER), `joinedAt` / `updatedAt` (auditing) | unique `(chatRoomId, userId)`, `userId` |
| `messages` | `Message` | `chatRoomId`, `senderId`, `createdAt`, `isDeleted` | `_id`; `messages_room_created_id`: `(chatRoomId ASC, createdAt DESC, _id DESC)` (CM-044) |

`spring.data.mongodb.auto-index-creation=true` (base `application.properties`) makes
Spring Data create the declared indexes at startup in every profile.

## Message history cursor (CM-044)

`Message` declares the nonunique compound index
`{chatRoomId: 1, createdAt: -1, _id: -1}` with `@CompoundIndex`, following the same
automatic startup creation pattern as participant indexes. History queries always
restrict `chatRoomId` and `isDeleted = false`, order by `createdAt DESC, _id DESC`,
and fetch `limit + 1` rows. A cursor applies the strict boundary
`createdAt < cursorTime OR (createdAt = cursorTime AND _id < cursorId)` within the
same room and deletion filter. The ID tie-break includes messages sharing the
same stored millisecond timestamp.
The tie comparison uses an aggregation `$expr` with a literal, correctly typed
ID boundary so it follows the same BSON ordering as the index. The existing
`String @Id` mapping stores valid 24-hex IDs as ObjectIds and other IDs as strings;
a plain query `$lt` would type-bracket its operand and could skip string IDs at
a timestamp shared with ObjectIds. No message fields or storage types change.

`GET /api/v1/rooms/{roomId}/messages?before=<cursor>&limit=<n>` returns
`ApiResponse<MessagePageResponse>` with `messages` oldest first, `nextCursor`, and
`hasMore`. The extra row is omitted; it only determines whether an older page
exists. `nextCursor` identifies the oldest included message and is null when no
older rows exist; `hasMore` is exactly `nextCursor != null`. Empty pages use
`messages = []`, `nextCursor = null`, `hasMore = false`. Nonpositive limits use 50;
positive limits are capped at 100. The response changes from the previous bare
list; the frontend switches in the coordinated CM-044 wave.

Clients treat cursors as opaque. `MessageCursor` encodes unpadded base64url of
`<createdAt epoch millis>:<message id>` and rejects malformed/noncanonical values.
The boundary uses stored BSON Date millisecond precision, not pre-save Instant
nanoseconds. Missing `before` selects the newest page; supplied empty/invalid
`before` returns a 400 `VALIDATION_FAILED` ProblemDetail through the history
controller's local validation handler. Caller-account, room existence and active
membership checks retain their existing 404/403 behavior and run before cursor
processing. Sender IDs in the returned page are deduplicated for one batched
`UserRepository.findAllById` lookup; empty pages need none. Missing sender accounts
or names retain `Unknown User`; the extra row does not trigger a sender lookup.

There is no `after=` catch-up parameter. Reconnect continues to refetch the newest
page and merge by message ID (CM-045). Repository integration tests cover timestamp
ties across page sizes, soft-deleted/other-room exclusion, string/ObjectId/mixed ID
mapping and automatic compound-index creation. Execution of the CM-044 tests is
delegated to the orchestrator's Maven verification gate.

## Membership invariants

1. The `participants` collection is the only source of truth for who belongs to a room
   (decision D4). `ChatRoom.participants` and `ChatRoom.admins` were removed; API
   responses still expose `participants` (user ids) by reading the collection, in one
   `$in` query for room lists.
2. A user is a member at most once per room: the unique index rejects duplicates, and
   `DuplicateKeyException` maps to `ALREADY_PARTICIPANT` (409).
3. `memberCount` equals the number of participant rows and never exceeds
   `maxParticipants`. It is only changed by conditional atomic updates in
   `ChatRoomRepository`:
   - `reserveSeat`: `$inc +1` only if the room is active and
     `memberCount < maxParticipants` (or unlimited). A missing counter counts as 0.
   - `releaseSeat`: `$inc -1` only if `memberCount > 0`.
   - `updateEditableFields`: `$set` of name/description/capacity/settings only if the new
     capacity still fits `memberCount`, so an edit never overwrites the counter.
   - `softDelete`: `isActive = false`, `memberCount = 0`, `deletedAt = now`.
   Room documents are never re-saved in full after creation.

## Join and leave flow (no multi-document transaction)

```
join:  room active? -> user exists? -> already member? (fast 409)
       -> reserveSeat (0 => 409 ROOM_FULL)
       -> insert participant (DuplicateKeyException => releaseSeat, 409 ALREADY_PARTICIPANT)
leave: delete participant row (0 rows => not a member) -> releaseSeat
```

If the process dies between `reserveSeat` and the insert, one seat stays reserved
(the counter is one too high and the room admits one member fewer). That drift is
safe for the capacity invariant; a periodic recount is a follow-up.

Losing concurrent duplicate joins hold a seat until the unique index rejects them, so a
nearly full room may answer `ROOM_FULL` instead of `ALREADY_PARTICIPANT` for a duplicate.

## Soft delete

`DELETE /api/v1/rooms/{roomId}` (creator only) calls `softDelete`, removes every
participant row of the room (blocking new REST/STOMP access and ordinary delivery to
existing room/typing subscriptions through the live CM-058 outbound guard), and broadcasts a SYSTEM message to `/topic/rooms/{roomId}`
(`docs/design/websocket-protocol.md`). Inactive rooms are invisible to every read and
cannot be joined. Messages of deleted rooms are kept.
Before `softDelete`, member IDs are snapshotted only for this terminal event's
internal delivery audience, so its subscribed recipients still receive it after
cleanup. This does not authorize subsequent ordinary frames. The snapshot follows
the existing nontransactional lifecycle; see the protocol's concurrency and
multi-instance delivery limits.

## Timestamps

`ChatRoom.createdAt`, `Participant.joinedAt` and `Participant.updatedAt` are filled by Spring
Data auditing (`@EnableMongoAuditing` in `config/MongoConfig`). Ids are generated by
MongoDB (ObjectId strings) so that auditing recognizes new documents.

## Existing data

Rooms created before CM-028 have no `memberCount` and still carry the old
`participants`/`admins` arrays (ignored on read). Their missing counter is treated as 0,
so their capacity is not enforced until a one-off backfill sets
`memberCount = count(participants where chatRoomId = room._id)`. That backfill needs
production access and is an owner task.

## Verification

- `ParticipantRepositoryIT`: unique index, generated id and audit dates, delete counts.
- `RoomMembershipIT`: 20 concurrent joins into a room with capacity 10 -> exactly 10
  succeed and `memberCount == 10`; concurrent duplicate joins store one row; leave gives the
  seat back; capacity edits below `memberCount` are rejected; soft delete blocks joins.
- `ParticipantServiceTest`, `ChatRoomServiceTest`: seat reservation/compensation,
  soft delete clean-up and broadcast, membership reads from the participants collection.

## Room type policies (CM-041)

`RoomTypePolicy` in `service/policy` owns type rules and the `create` factory method.
`RoomTypePolicyRegistry` injects all policies into an `EnumMap`; missing or duplicate
policies fail startup. Services persist the constructed room and its initial memberships;
role assignment checks and atomic capacity reservation/compensation remain in
`ParticipantService` (CM-008, CM-028, ADR-0005). DTO validation groups remain unchanged.

| Type / policy | Create | Join | Add participant | Update | Leave |
|---|---|---|---|---|---|
| PUBLIC / PublicRoomPolicy | Configurable group, one OWNER, default unlimited capacity | Allowed | CM-008 role rules | Editable fields, atomic capacity check | Members may leave; creator denied (403) |
| PRIVATE / PrivateRoomPolicy | Configurable group, one OWNER, default unlimited capacity | Denied (403) | CM-008 role rules | Editable fields, atomic capacity check | Members may leave; creator denied (403) |
| DIRECT_MESSAGE / DirectRoomPolicy | Existing other user, OWNER + MEMBER, fixed capacity 2; self DM denied (400) | Denied (403) | Denied (403 FORBIDDEN_ACTION) | Capacity changes denied (400); other fields allowed | Denied (403) |

`ParticipantService.isUserParticipant` requires both an active room and a membership
row. STOMP room SUBSCRIBE/SEND authorization, typing, message sending,
and REST message history all use this guard. A join that inserts after soft-delete
cleanup may still leave an orphan row, but it cannot grant access to the inactive room.
CM-058 applies the same guard immediately before every ordinary outbound room/typing
delivery, including already established subscriptions. No membership cache is used;
a removal or soft-delete in shared MongoDB blocks the next check on any instance.
Only the server-marked room-deleted event uses its pre-delete member snapshot.
Other subscriptions and the STOMP connection remain usable; already accepted
transport frames cannot be recalled. See `websocket-protocol.md` for the instance-local
room-event fan-out limitation and the per-recipient database-read cost.

## MVP v0 additions (SPEC-008, planned)
Status: Approved design, implemented by the tickets named below.

### chat_rooms: activity summary (CM-061)
- `lastActivityAt` (`Instant`, new): set with one atomic `$set` after a non-SYSTEM message insert. Missing on old rooms: readers fall
  back to `createdAt`, so no backfill is needed.
- `lastMessage` (embedded, new): `{id, senderId, senderName, preview (<= 100 chars), createdAt}`, written in the same `$set`.
  Use a conditional update (`lastActivityAt < message.createdAt` or missing) so a late writer never moves it backwards.
- The existing `lastActivity` (`LocalDateTime`) is changed by membership and settings updates, not by messages. It is left as is in v0
  (not shown in the UI, not used for sorting) and removed with the `Instant` cleanup in v1.
- SYSTEM messages never update `lastActivityAt`/`lastMessage` (SPEC-008 AC-008-7).

### participants: read marker (CM-061)
- `lastReadAt` (`Instant`, new) is the read marker. `PUT /rooms/{id}/members/me/read` sets it to now. A new member gets `lastReadAt = now`.
- `lastSeenAt` is **not** reused: it is a `LocalDateTime`, which Spring converts with the server time zone, so comparing it with
  `messages.createdAt` (`Instant`, UTC) would shift by the zone offset on any non-UTC machine.
- `unreadCount` = count of messages with `chatRoomId = room`, `createdAt > lastReadAt`, `senderId != caller`, `type != SYSTEM`,
  `isDeleted = false`, using the existing index `(chatRoomId, createdAt, _id)`. A missing `lastReadAt` (rows created before CM-061)
  counts as 0 unread, so existing users do not see a burst of old badges after the release.

### messages: client id (CM-068)
- `clientMessageId` (string, optional, new): the client's `tempId`, stored on insert.
- Unique partial index `messages_room_sender_client`: `{chatRoomId: 1, senderId: 1, clientMessageId: 1}` where `clientMessageId` exists.
  A `DuplicateKeyException` on insert loads and returns the stored message (no second row); history and broadcasts include `clientMessageId`.

## Consent, requests, blocks and reports (SPEC-009, v0 scope)
Status: Approved (SPEC-009, ADR-0006). Join requests, `room_removals` and mute are v1 (D-02, D-03).

### chat_rooms (new field, CM-072)
- `state`: `ACTIVE` (default; a missing field reads as `ACTIVE`, so no backfill) | `REQUESTED` (DM waiting for the recipient).
  `isActive` stays the soft-delete flag.
- `memberKey` remains set for `REQUESTED` and `ACTIVE` DMs, so one DM per pair is enforced by the existing unique sparse index.
  Decline and expiry clear it (as soft delete does today).

### participants (new field, CM-075)
- `hiddenAt` (`Instant`, nullable): DM hidden by this member. A message persisted after it clears it for that member (AC-009-21).
- `isMuted` exists but stays unused in v0 (mute is v1).
- The owner is the row with `role = OWNER` (CM-076). `createdBy` on `chat_rooms` stays as history.
- Owner auto-transfer (AC-009-24): pick the earliest `joinedAt` ADMIN, else the earliest MEMBER (tie-break `_id`), update that row to
  `OWNER` with a conditional update (`role != OWNER`), then delete the leaving owner's row and release the seat.

### membership_requests (new, CM-070 and CM-072)
| Field | Notes |
|---|---|
| `_id` | id |
| `kind` | `INVITE` \| `DM_REQUEST` (`JOIN_REQUEST` reserved for v1) |
| `roomId` | target room (the DM room for `DM_REQUEST`) |
| `inviterId` | who started it (inviter, or DM sender) |
| `targetUserId` | who must answer (invitee or DM recipient) |
| `status` | `PENDING` \| `ACCEPTED` \| `DECLINED` \| `REVOKED` \| `EXPIRED` (`REJECTED` reserved for v1) |
| `pairKey` | sorted user pair (same format as `memberKey`), `DM_REQUEST` only |
| `createdAt`, `expiresAt`, `decidedAt` | `Instant` |
| `cooldownUntil` | `Instant`, set on a declined `DM_REQUEST` (decided + 30 days) |

Indexes:
- unique partial `{roomId: 1, targetUserId: 1}` where `status = PENDING` (one pending per room and person);
- `{targetUserId: 1, kind: 1, status: 1}` for "my pending invitations / DM requests";
- `{roomId: 1, status: 1}` for the room's pending invitations;
- `{pairKey: 1, cooldownUntil: 1}` for DM decline cooldowns.

Accept path (ADR-0005 style): `findAndModify` `{_id, status: PENDING, expiresAt > now}` -> `ACCEPTED`; then `reserveSeat` and insert the
participant; if either fails, set the request back to `PENDING` and return the error.

### user_blocks (new, CM-073)
- `{blockerId, blockedId, createdAt}`; unique `{blockerId: 1, blockedId: 1}`; `{blockedId: 1, blockerId: 1}` for the reverse check.
  "Blocked either way" is one `$or` query on these two indexes.

### reports (new, CM-074)
- `{reporterId, targetType, targetId, reason, note (<= 500), createdAt}`; unique `{reporterId: 1, targetType: 1, targetId: 1}`;
  `{targetType: 1, targetId: 1}` for later reviews. No status field in v0.

### Expiry (CM-072)
- An hourly `@Scheduled` job sets `EXPIRED` on `PENDING` rows past `expiresAt` in batches, and for `DM_REQUEST` soft-deletes the room and
  sends `ROOM_REMOVED {reason: EXPIRED}` to the sender. Every read and accept also checks `expiresAt`, so the job is not needed for correctness.
  v0 runs one backend instance (D-11); the job is idempotent if that changes.
