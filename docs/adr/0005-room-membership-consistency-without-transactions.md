# ADR-0005: Keep room membership consistent with atomic updates instead of transactions
- Status: Accepted
- Date: 2026-10-09 · Deciders: @N-Tien-L

## Context
Room membership was stored twice (`ChatRoom.participants` array and the `participants`
collection) and capacity was checked with count-then-insert, so concurrent joins could
exceed `maxParticipants` (audit C-8, M-5). The services were annotated with
`@Transactional`, but no `MongoTransactionManager` is configured, so the annotations had
no effect. Decision D4 already made the `participants` collection the source of truth.
Multi-document transactions need a replica set (Atlas has one; the local compose and
Testcontainers setups run a single node unless configured otherwise) and add latency and
retry handling for write conflicts.

## Decision
We keep membership consistent without multi-document transactions:
- Membership rows live only in `participants`, with a unique `(chatRoomId, userId)` index.
- The room keeps a `memberCount` that is changed only by conditional atomic updates
  (`$inc` guarded by `memberCount < maxParticipants`, see `ChatRoomRepository`).
- Joining reserves a seat first, then inserts the participant; a failed insert gives the
  seat back (compensation). Leaving deletes the row, then gives the seat back.
- Room edits use a targeted `$set` (never a full save) and re-check capacity against the
  live counter.
- Deleting a room is a soft delete plus removal of its participant rows.
- All `@Transactional` annotations on Mongo services are removed.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| `MongoTransactionManager` + `@Transactional` | All-or-nothing join; familiar programming model | Needs a replica set everywhere, including tests; write-conflict retries; the capacity race still needs a guarded update or `@Version` |
| Optimistic locking (`@Version` on `ChatRoom`) with retries | Detects lost updates on full saves | Existing documents have no version (null means "new" to Spring Data, so the first save becomes an insert and fails); retry loops under contention |
| Count participants on every join without a counter | No counter to maintain | Check-then-act race remains; needs a transaction or a lock |

## Consequences
- Positive: Capacity can never be exceeded, duplicates are impossible, no replica set or
  transaction manager is required, and the behavior is proven by `RoomMembershipIT`
  (20 threads, capacity 10, exactly 10 joins).
- Negative / technical debt: If the process stops between reserving a seat and inserting
  the row, the counter stays one too high (safe but wasteful). Near capacity, a losing
  duplicate join can report `ROOM_FULL` instead of `ALREADY_PARTICIPANT`.
- Follow-up tasks: one-off backfill of `memberCount` for rooms created before CM-028
  (owner, needs production access); optional periodic recount job; revoke live STOMP
  subscriptions when a room is deleted (CM-045).
