# Frontend context brief: ChatMee frontend (CM-084)

Updated: 2026-10-14 · Current phase: 1 (questions asked, waiting on blocking answers) · Depth: full for product direction, standard per feature slice

Labels: `confirmed` · `evidence-backed` · `assumed` · `proposed` · `unresolved`. Source pointers follow each label.

## Assignment

- Type: existing-backend frontend (`confirmed`, owner chat 2026-10-14). The audit below shows the priority journeys are already
  implemented on `develop`; in practice this run is a **product-level visual redesign of both surfaces plus full-stack verification
  of the priority journeys** (`evidence-backed`, BOARD.md CM-044..069 merged).
- Completion level: real integration; release and deploy out of scope (`confirmed`, owner chat).
- Authorized scope and constraints (`confirmed`, owner chat + AGENTS.md §7):
  - Branch `feat/CM-084-frontend-delivery` from `develop` in worktree `ChatMee-cm084`; commits allowed there only. No push, merge, PR, deploy.
  - Ticket CM-084 is `proposed` (`docs/plan/CM-084-frontend-delivery.md`), not yet on the board.
  - No new dependencies, registries or tool installs without owner approval. Third-party components in `frontend/components/fx/` with
    a row in `frontend/components/PROVENANCE.md`.
  - Do not read `.lab-key.md` or any lab-to-variant mapping; `docs/plan/CM-083-lab/` is unrated input until the owner reveals results.
  - Backend changes: none planned; any gap found is reported, not fixed silently.

## Goals and success criteria

| Item | Label | Source |
|---|---|---|
| v0 core loop works end to end: sign in, find a person or room, talk, notice new messages elsewhere, come back and reply | confirmed | SPEC-008 §1 |
| App looks and behaves consistently: no dead controls, no `alert()`, tokens only, 360 px layout | confirmed | SPEC-008 AC-008-10, AC-008-11 |
| Priority journeys for this run: OAuth sign-in; browse and join rooms; realtime send/receive in a room; reconnect and expired-session recovery | confirmed | owner chat; matched to SPEC-001, SPEC-002 AC-002-3/4, SPEC-004 AC-004-3..7, SPEC-008 AC-008-14 |
| One design system that holds on a public page and on the dense chat workspace | confirmed | owner chat |
| Public pages: a visitor understands what ChatMee is and how it is built within seconds, then signs in with one action | evidence-backed | `PRODUCT.md` on `feat/CM-082-landing-login` (inferred there, not interviewed) |

## Users and needs

| User group / role | Tasks and goals | Context, devices, accessibility | Label | Source |
|---|---|---|---|---|
| Recruiters / engineers evaluating the portfolio | Understand the product and its engineering in under a minute; try it | Desktop first, some mobile; short visits | assumed | CM-082 PRODUCT.md (inferred, no interview) |
| Signed-in chat users | Read and reply across rooms and DMs, notice new activity, recover from drops | Desktop and mobile from 360 px; keyboard use; screen readers on the message log | evidence-backed | SPEC-008 §3, AC-008-11; UI_UX_AUDIT §3.6 |

User evidence available: none (no research, analytics or support data). Owner taste is aesthetic input, not usability evidence.

## Existing system and authoritative sources

- Authority order: owner chat and Approved specs > design docs / ADRs > tickets > code (AGENTS.md §1, CLAUDE.md).
- Documents: `docs/specs/SPEC-001..009`, `docs/design/websocket-protocol.md`, `docs/design/error-handling.md`, `docs/design/ui-workflow.md`,
  `docs/audit/UI_UX_AUDIT.md`, `docs/plan/MVP_V0_PLAN.md` (CM-063..080 and the v0 smoke checklist), `docs/plan/BOARD.md`.
- Frontend on `develop` (41bbb29), audited 2026-10-14:
  - Routes: `/` redirects to `/login`; `/login`; `/dashboard?roomId=` (list + conversation, single pane below 768 px); `/profile`.
  - Shell: `AuthGate` (checks `/auth/me`, skeleton, redirect), `StompProvider` (one STOMP session, ws-token, capped backoff with
    jitter, 401 on ws-token -> `/login`, room list refetch on every connect), `ConnectionBanner`, `AppHeader` + `UserMenu`, `proxy.ts`
    cookie guard (UX only), axios 401 -> `/login`.
  - Components: `components/common/*` (avatars, badge, relative time, confirm dialog, empty state), `room/*` (list, list item,
    create, discover, info, settings dialogs), `chat/*` (interface, header, message list with grouping/load-older/new-messages
    button, input, typing), `user/*` search. shadcn primitives in `components/ui/*` (do not edit).
  - Tokens: `app/globals.css`, shadcn neutral + teal `--primary` (light) and a `.dark` set; dark sidebar tokens still default indigo.
    Fonts: Geist, Geist Mono, Borel (wordmark only).
  - State: Zustand stores (`authStore`, `chatRoomsStore`, `chatStore`, `discoverRoomsStore`, `usersStore`); `useRoomMessage` + reducer.
  - Tests: 37 files / 222 vitest tests (BOARD CM-077 master re-run).
- Not on `develop`: CM-081 tooling (`.mcp.json`, project skills, `components.json` registries) and CM-082 landing/login
  (`feat/CM-082-landing-login`, unmerged). Lab `lab/frontend-eval` is never merged.
- Backend contracts: REST under `/api/v1` (OpenAPI `/v3/api-docs`), STOMP `/ws` per `docs/design/websocket-protocol.md`,
  errors as `ProblemDetail` per `docs/design/error-handling.md`.
- Commands that define "done": `./mvnw verify` (needs Docker for Testcontainers) and
  `npm run lint && npx tsc --noEmit && npm test && npm run build` (AGENTS.md §2).
- Reuse: all stores, realtime layer, API clients, a11y behaviour and tests. Missing: a deliberate visual system across surfaces,
  a landing page on `develop`, a full-stack run of the priority journeys. May change: tokens, layout chrome, component styling,
  login and landing markup.

## Features and scope

| Feature | Actor -> outcome | Scope | Integration | Acceptance criteria (observable) | Label |
|---|---|---|---|---|---|
| OAuth sign-in | Visitor -> signed in on `/dashboard`; signed-in user opening `/login` lands on dashboard; failed callback shows an error | MVP | real | AC-001-1, -4, -5, -9 | confirmed (SPEC-001) |
| Browse and join rooms | Member -> sees own rooms by activity; discovers PUBLIC rooms; joins; full room shows a clear message | MVP | real | AC-002-2, -3, -4; AC-008-2, -4 | confirmed (SPEC-002, SPEC-008) |
| Realtime room messaging | Member -> sends; message goes sending -> sent / failed with Resend; others see it live; history loads older | MVP | real | AC-004-3..8; AC-008-11, -13 | confirmed (SPEC-004) |
| Reconnect and expired session | User -> sees "Reconnecting", missed messages appear after reconnect; expired session lands on `/login`, not endless reconnect | MVP | real | AC-004-7; AC-008-14; SPEC-001 §5 | confirmed |
| Public landing page | Visitor -> understands ChatMee and signs in | **conflict, see Q1** | static | CM-082 AC-1..6 as a starting point | unresolved |
| Room dialogs/invites/roles (CM-066), requests inbox (CM-079), safety UI (CM-080) | — | out of this run (existing tickets) | — | — | proposed (cut) |

## Constraints and risks

| Constraint or risk | Impact | Mitigation or spike | Label |
|---|---|---|---|
| SPEC-008 §2 lists "landing/marketing page, dark mode" as v1+ non-goals | A landing page on the product branch contradicts an Approved spec | Q1 to owner; do not edit the spec | unresolved |
| CM-083 lab is unrated; its result may change the public-page direction | Rework of the landing direction | Q2: direction for the workspace first; revisit landing only when results arrive | proposed |
| Docker Desktop not running; backend env files live untracked in the main checkout | No local backend, no `./mvnw verify`, no milestone C | Q4: owner starts Docker + backend | evidence-backed (`docker version` failed 2026-10-14) |
| OAuth needs the owner's real login; agent may not enter passwords | Journey checks need the owner at sign-in | Owner signs in once per browser context; agent drives the rest | confirmed (safety rules) |
| `POST /rooms/{id}/members` removed by CM-070 but the frontend still calls it until CM-066 | Add-member in RoomSettingsDialog fails | Not a priority journey; note as known gap, do not fix here | evidence-backed (MVP_V0_PLAN line 57) |
| WS-A14 inbound ordering is a v0 known gap | Rare first-frame loss after SUBSCRIBE+SEND | No frontend action | confirmed (BOARD 2026-10-12) |

## Design context

- Brand commitments: name ChatMee; Borel for the wordmark only; Geist and Geist Mono; teal `--primary` (`evidence-backed`, `globals.css`,
  CM-063, CM-082). Whether these stay fixed is Q3.
- References liked: none recorded for the workspace. CM-082 direction ("client | wire mirror", dark, one teal accent) was judged plain by
  the owner (`evidence-backed`, memory of CM-083 start; owner to confirm).
- Avoid: generic SaaS purple gradients, gradient text, invented metrics or testimonials (`evidence-backed`, CM-082 PRODUCT.md).
  Heavy effects only on public pages; chat screens prioritize density and readability (`confirmed`, ui-workflow.md step 7).
- Freedom to change: fonts (Q3), theme (Q1/Q3), palette (Q3), layout yes, motion yes (subtle in the workspace), dependencies no without approval.
- Surfaces: public/persuasive = landing, login. Working = dashboard (room list, conversation, dialogs), profile.
  Preferences for the public pages do not apply automatically to the workspace.
- Personal preferences adopted for this project: none (no personal-preferences file found).

## Decisions and open questions

- Decisions: see `decisions.md`.
- Open questions: see the Phase 1 question batch (D-5 in `decisions.md` records the defaults used while waiting).

## Workflow settings

- Directions: 1 principal + 1 alternative (default).
- Component shortlist / rendered: 3 / 2 per role (default).
- Polish rounds after milestone B: 2 (default).
- Milestones in use: A, B, C.
- Evidence folder: `docs/frontend/evidence/` (screenshots tracked only when cited in a handoff; proposed).
- Usage tracking: on.

## Capabilities

| Capability | Status | Adapter or fallback in use | Checked how |
|---|---|---|---|
| File and repo inspection, shell | available | built-in tools | used throughout |
| Impeccable skill 4.5.2 | available (launcher not yet run) | phase 3 shape/critique; fallback `design-review-checklist.md` | session skill list; `.claude/skills/impeccable/SKILL.md` version line (main checkout) |
| shadcn skill | available | read its rules before any component work | session skill list |
| shadcn MCP | unusable | shadcn CLI `view` (read-only) if the owner allows the `npx` download; else manual source review | MCP connect timeout at session start |
| shadcn registries (`@magicui`, `@aceternity`, `@react-bits`) | missing on `develop` | configured only on CM-081 branch `components.json`; needs Q5 | `git ls-tree` |
| Playwright MCP | available | browser checks, screenshots, network/console capture | tool list loaded |
| Built-in browser pane | available | owner-visible preview, OAuth sign-in by the owner | tool list |
| Playwright test runner / `playwright-tester` skill | missing (`@playwright/test` not a dependency) | Playwright MCP scripted checks; adding the runner is a dependency decision | `package.json` |
| Accessibility evaluation (axe) | missing | Playwright accessibility snapshot + keyboard and contrast checks; partial coverage stated | `node_modules/.bin` |
| Performance profiling (Lighthouse, DevTools MCP) | missing | build output sizes + timing via Playwright, labelled approximate | `node_modules/.bin`, tool list |
| Frontend scripts (lint, tsc, vitest, build) | available | project scripts | `npm ci` in worktree OK; baseline run 2026-10-14 |
| Backend run + `./mvnw verify` | blocked | needs Docker Desktop (Testcontainers, Mongo, Redis) and env from the owner | `docker version` failed; Java 21 present |
