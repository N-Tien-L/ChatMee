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
