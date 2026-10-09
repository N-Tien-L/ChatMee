# ADR-0002: Use Redis for presence and rate limiting
- Status: Accepted
- Date: 2026-10-08 Â· Deciders: @N-Tien-L

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


## Amendment 2026-10-09 (CM-043)

Presence is determined by authenticated STOMP sessions across all instances. Each
process generates a random instance ID at startup (an override must be unique per
running process). A session is a hash field `<instanceId>:<sessionId>`, whose value
is its owning instance ID. Session IDs are never logged.

Registry layout (default prefix `presence:{registry}:`):
- `sessions:<userId>`: hash of authenticated sessions and owners; empty hashes disappear.
- `alive:<instanceId>`: instance lease, refreshed every 10 s, TTL 30 s.
- `online`: shared set of visible online users, including users in the grace period.
- `pending`: sorted set of users and offline deadlines, measured by Redis TIME.

`presence-registry.lua` atomically adds/removes sessions, cancels or creates grace
deadlines, reconciles an instance's local session snapshot, prunes expired owners,
and publishes transitions on `presence-channel`. An online transition is published
only when SADD changes the shared online set. Offline is published only when the
last session is gone and its 10 s grace deadline has elapsed. A new session removes
the deadline without publishing another online event. Duplicate events and concurrent
sweeps are idempotent. Publication is inside Lua to prevent a delayed publisher from
reordering a reconnect and an offline transition. All keys use the same Redis hash tag;
this deployment requires Redis scripting and Pub/Sub on the same registry service.

Every instance sweeps once per second; GET also sweeps and reads the shared set.
Live instance snapshots reconcile every 10 s, removing disconnects missed during an
outage and restoring still-connected sessions after Redis data loss. Application
heartbeats refresh only known local authenticated sessions; payload flags are ignored.
Configuration: `presence.instance-id`, `presence.registry-prefix`, `presence.refresh-ms`,
`presence.instance-ttl-ms`, `presence.sweep-ms`, `presence.grace-ms` (durations in ms).
Keep refresh shorter than the instance TTL. Tests construct services with short TTLs
and grace periods without changing production defaults.

Failure modes:
- Process crash: other instances prune its sessions after lease expiry, then apply
  the grace period. Expected bound is TTL + grace + two sweep intervals (about 42 s): one
  interval to observe lease expiry and one to observe the grace deadline.
  If every instance stops, cleanup resumes on the next sweep/read after startup.
- Long process pause / network partition: the lease can expire despite live sockets;
  presence can become temporarily offline, then recover from the local snapshot.
- Redis unavailable: presence fails open; connection/disconnection, heartbeats and
  REST do not reject users. Reads fall back to an immutable local-session snapshot;
  cross-instance accuracy and grace are unavailable during the outage. Log only
  exception class, never session IDs or Redis error messages/credentials. No synthetic
  transitions are broadcast while Redis is unavailable. Recovery reconciles sessions.
- Pub/Sub is best effort. A subscriber outage can lose transitions; GET reads the
  authoritative registry to resynchronize. Atomic state/publication does not provide
  durable event delivery. Redis data loss can emit new online transitions on recovery.
- Sweeps and snapshot reconciliation scan all online users and sessions in Lua. This
  is appropriate for the current app size; large registries need bounded work and
  expiry indexes in a separate ticket. Redis namespaces must be isolated per deployment.

Open question: restrict presence visibility to users sharing a room (SPEC-005 AC-005-4).
The global topic and online-users API remain unchanged. Message fan-out is separate.
