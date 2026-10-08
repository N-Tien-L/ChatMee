# ADR-0001: Use MongoDB as the primary data store
- Status: Accepted
- Date: 2026-10-08 · Deciders: @N-Tien-L

## Context
The primary data is messages (high write volume, read by room and time), rooms have flexible `settings`, and the personal project uses a free Atlas tier.

## Decision
Use MongoDB (Spring Data MongoDB), storing 4 collections: `users`, `chat_rooms`, `participants`, `messages`.
The room membership source of truth is the `participants` collection with a unique index `(chatRoomId, userId)`; the `ChatRoom.participants` field will be dropped in CM-028.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| PostgreSQL | Provides ACID and more natural membership relations | Requires stricter schema design and migrations |
| Cassandra | Highly scalable | Overkill for this scale |

## Consequences
- Positive: Flexible schema, easy-to-use free tier, fast queries by `chatRoomId + createdAt` if indexed.
- Negative / technical debt: Integrity constraints must be handled manually (unique indexes, atomic updates). Multi-document transactions require a replica set and `MongoTransactionManager`. (Audit finding: indexes are not auto-created, `@Transactional` has no effect currently, must be fixed in CM-007).
