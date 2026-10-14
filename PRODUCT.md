# Product

<!-- impeccable:product-schema 1 -->

> Source: derived from the confirmed CM-084 context brief (`docs/frontend/context.md`, owner answers of 2026-10-14) and the Approved
> specs. No separate Impeccable interview was run, to avoid repeating questions the owner already answered. Facts marked _(inferred)_
> are not separately confirmed; the owner reviews this file at milestone A.

## Platform

web

## Users
- Signed-in chat users who talk in rooms and direct messages, on desktop and on phones down to 360 px, and need to notice new
  activity in other conversations and come back to reply (SPEC-008 §1, §3).
- Recruiters and engineers evaluating ChatMee as a portfolio piece for a Java/Spring Boot internship. They spend under a minute on
  the public pages, want to see what it is and how it is built, and may sign in to try it. _(inferred, CM-082)_

## Product Purpose
ChatMee is a real-time chat app: rooms, direct messages with consent, presence, typing, unread counts. It exists to be used, not
demoed, and as evidence of backend engineering. Success: the core loop works end to end (sign in, find a person or room, talk, notice
new messages elsewhere, come back and reply) and the app looks and behaves consistently.

## Positioning
A chat app whose real-time layer is built by hand on Spring Boot: STOMP over WebSocket with single-use connect tokens, per-user event
queues, idempotent sends, MongoDB storage, Redis presence and rate limits, OAuth2 session auth. The engineering is the point, not a
feature list.

## Operating Context
- Two surfaces: public pages (landing, sign-in) read in seconds; the workspace (room list, conversation, dialogs) used for long
  sessions, often beside other windows.
- Connections drop and sessions expire; the app must say what is happening and recover on its own.

## Capabilities and Constraints
- Realtime messaging over STOMP; history paged by cursor; optimistic send with sending, sent, failed and Resend.
- Rooms (PUBLIC, PRIVATE), discovery of PUBLIC rooms, DMs as requests until accepted, roles OWNER/ADMIN/MEMBER, block, report, hide.
- Presence (global in v0) and typing indicators; unread counts per room; no "new messages" divider in v0.
- Sign-in with GitHub or Google only; no passwords.
- Not in v0: message edit/delete, attachments, reactions, read receipts, search, push notifications, a user-facing dark mode.
- Stack: Next.js 16 + React 19 + Tailwind 4 + shadcn/ui frontend; Spring Boot 4 backend; Render and Vercel.

## Brand Commitments
- Name: ChatMee. Wordmark in Borel; UI type Geist and Geist Mono (owner, 2026-10-14, D-8).
- Public pages use a fixed dark theme, the workspace a fixed light theme; no theme switch (owner, D-7).
- Colour is open for exploration; teal is the incumbent accent (owner, D-8).
- Tone: confident, calm, technical. No generic SaaS purple gradients, no gradient text. _(inferred, CM-082)_

## Evidence on Hand
- The running app and its source. No screenshots, metrics, user counts, customers or testimonials exist; never invent them.
- Demonstration content on public pages must be static, labelled as demo data, and match `docs/design/websocket-protocol.md`.

## Product Principles
1. Show the system working rather than describing it.
2. One clear action on public pages: sign in.
3. Inside the app, readability and density beat decoration; effects belong to public pages.
4. Never hide connection or delivery state: the user always knows whether a message arrived.
5. Honest about scope: a real, small product, not a startup pitch.

## Accessibility & Inclusion
Keyboard-reachable actions with visible focus, WCAG AA contrast, semantic landmarks, the message list as a polite live log, layouts
from 360 px, and `prefers-reduced-motion` honoured everywhere.
