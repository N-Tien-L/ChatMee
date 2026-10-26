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
Enable preserveReceiveOrder only together with an OrderedAuthChannelInterceptor that
invokes the existing authorization interceptor, converts authentication/authorization
rejections to a sanitized session-targeted STOMP ERROR and returns null. This avoids
relying on propagation through the ordered channel decorator, which previously swallowed
rejections. The transport's ERROR handling closes the connection. Preserve rate limits,
identity/room checks and outbound reauthorization. Real wire tests must prove ERROR,
close and subscribe-before-send behavior before considering the ordering gap closed.

## Ticket boundaries
CM-102: session binding/revocation. CM-103: presence filtering. CM-104: same-account
block/decline invalidation. CM-105: ordered receive with explicit safe rejection.
Each ticket has its own branch/commit and tests. CM-106 covers a separate local-only
synthetic preview so owner testing need not occupy E2E ports/data/build output.
