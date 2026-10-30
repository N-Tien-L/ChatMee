# M1 session and privacy hardening

Status: implementation design for owner-authorized SPEC-011, 2026-10-26.

## Session ownership
Keep the single-use Redis token and current HTTP-session cookie architecture. Bind each
issued token privately to its issuing HttpSession and then to the actual WebSocket
transport session at CONNECT. A local WsSessionRegistry tracks pending tokens, connected
transports and HTTP-session bindings; it contains no public identity authority.

Servlet session-destroy callbacks revoke the current session's pending tokens and close
its transports. A bounded periodic sweep and inbound/outbound checks also enforce the
HTTP idle deadline without touching/refreshing it. Independent sessions of the same user
are separate bindings. Register transports through a WebSocketHandlerDecorator, and
clean up on transport close. Reject a binding that disappeared during CONNECT/logout.
Token registration/invalidation races fail closed; only owned sockets are closed.

Use single-process in-memory bindings deliberately because HTTP sessions and the simple
broker are already process-local. Redis remains token storage, not a newly invented
shared session store. Restart requires relogin. Unknown/old local bindings are rejected.
No new dependency, persistent schema or production migration is needed.

## Presence authorization
Retain GET /online-users response shape and /topic/presence destination. A new
PresenceVisibilityService derives related IDs from authoritative participants and active
rooms; self is permitted. PresenceRestController delegates to that service. A
PresenceSubscriptionInterceptor filters every outbound presence frame by its bound
socket user and current shared active membership, dropping malformed/unavailable data.
The global Redis registry remains internal. Browser room lifecycle changes refetch and
replace the filtered online set. Hidden DM membership is unchanged; requested-only
recipients have no shared membership. No public user-ID query or new destination.

## Same-account tab reconciliation
Add ACCOUNT_STATE_CHANGED on existing /user/queue/events with payload
{scope: BLOCKS | DM_REQUESTS}, sent only to the account that made the decision. The
frontend refetches its own rooms/inbox/blocks as applicable. Preserve sender-side
ROOM_REMOVED and generic block/cooldown failures. This is best-effort invalidation,
not durable replay; reconnect remains authoritative.

## Inbound ordering and safe rejection
The final owner-selected strategy is ADR-0008: core/max=1 inbound worker with
FIFO capacity 100, preserving the existing authorization interceptor and ERROR/close
path. A held SUBSCRIBE must complete before a following SEND is handled. Slow inbound
work blocks every session, so this is limited to M1's small single-process audience.
The native preserveReceiveOrder flag and OrderedAuthChannelInterceptor adapter were
rejected after multi-session private-queue failures; neither is part of this candidate.
Real wire tests cover order, safe rejection and the original multi-session contracts.

## Ticket boundaries
CM-102: session binding/revocation. CM-103: presence filtering. CM-104: same-account
block/decline invalidation. CM-105: one inbound worker with the existing safe rejection path.
Each ticket has its own branch/commit and tests. CM-106 covers a separate local-only
synthetic preview so owner testing need not occupy E2E ports/data/build output.

CM-103 lifecycle detail: PRESENCE_SCOPE_CHANGED with empty payload on existing
/user/queue/events invalidates only affected accounts' filtered snapshot. Announce it
after join/leave/removal to current members plus a departing member. Existing
ROOM_REMOVED handles the captured deletion audience. It carries no subject identity or room metadata and adds no destination.

## CM-105 owner decision
ADR-0008 selects core/max=1 inbound worker with existing FIFO capacity100 for small
M1 usage. Original rejection path and outbound pool remain. Native prototype excluded
after three multi-session IT regressions. Slow inbound work blocks other sessions;
future concurrency requires a separate tested compatibility decision.
