# ADR-0004: WebSocket authentication via short-lived token
- Status: Accepted
- Date: 2026-10-08 · Deciders: @N-Tien-L

## Context
Vercel cannot proxy WebSockets, so the client must connect directly to Render (cross-site), meaning the session cookie cannot be used. Consequently, commit `0d8f01a` removed authentication (Critical C-2 finding).

## Decision
Option A: A short-lived single-use token from `POST /api/v1/auth/ws-token`, stored in Redis with TTL 60s and consumed with `getAndDelete`, sent in the STOMP CONNECT header and validated by a `ChannelInterceptor`.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| (B) Shared Custom Domain | Cookie `Domain=.chatmee.dev` works natively across subdomains | Requires DNS configuration and specific domains |
| (C) Fully Stateless JWT | No session lookup needed | Large architectural change, unnecessary for our scale |

## Consequences
- Positive: Small scope of change, independent of domain, good technical story for interviews.
- Negative / technical debt: Requires managing tokens and an extra REST call before connecting.

## Amendment (CM-068): precise cookie rationale
The Context above says that a cross-site connection means "the session cookie cannot be used". That is too strong.
Whether a cross-site browser request carries the session cookie depends on the cookie domain, `SameSite`, and the
browser's policy, so it is not impossible in every deployment (see `docs/audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md`
section 4). The accurate reason is that the token removes the dependency on cookie configuration between the separately
deployed frontend (Vercel) and backend (Render). Cookie reuse would require coordinated domain and `SameSite` settings
across both deployments. The decision is unchanged: the single-use token, its 60-second TTL, and the STOMP CONNECT header.
