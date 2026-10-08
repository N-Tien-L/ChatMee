# ADR-0002: Use Redis for presence and rate limiting
- Status: Accepted
- Date: 2026-10-08 · Deciders: @N-Tien-L

## Context
Presence is ephemeral data, constantly changing, and must be consistent across instances; rate limiting requires an atomic counter with a TTL.

## Decision
Use Redis (Upstash). Use `INCR`+`EXPIRE` (or Lua token bucket) for rate limits; hash counting sessions by user for presence; use Pub/Sub to fan-out presence events to all instances.
Decision: presence session counting and fan-out through Redis are kept as the multi-instance goal, implemented in CM-043; phase 0 does only the minimal fix CM-011.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| In-memory RAM | Simplest | Only works for a single instance (current state) |
| MongoDB | Persistent | Slow, no convenient TTL for rapid changes |
| RabbitMQ (STOMP broker relay) | Full-featured | Requires operating an additional service |

## Consequences
- Positive: Cheap and simple.
- Negative / technical debt: Pub/Sub does not guarantee delivery (fire-and-forget), so presence requires heartbeats and TTLs. SimpleBroker is still in-memory: when scaling horizontally, messages must also fan-out via Redis, or switch to a broker relay (future ADR).
