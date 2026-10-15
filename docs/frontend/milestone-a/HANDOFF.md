# Handoff: milestone A (direction proposal) · 2026-10-14

## Scope completed

- Phase 1 context brief (`docs/frontend/context.md`), decisions D-1..D-9 (`docs/frontend/decisions.md`), proposed ticket
  `docs/plan/CM-084-frontend-delivery.md`.
- Phase 2 journeys, routes, state inventory and gaps G1..G4 (`docs/frontend/experience.md`).
- `PRODUCT.md` (Impeccable product record) derived from the brief, for owner review.
- Phase 3 start: one principal direction plus one alternative, each sketched on the dense chat screen (light) and the landing (dark),
  plus the category standard as a reference point. Impeccable concept-seed key `cfab315d` (mode operate).

## How to view

- Sketches (static HTML, first viewport 1440 x 900, no JavaScript): served at `http://127.0.0.1:4173/` from
  `docs/frontend/milestone-a/` (`python -m http.server 4173`). Files: `qsl-workspace.html`, `qsl-landing.html`,
  `airmail-workspace.html`, `airmail-landing.html`, `canon-workspace.html`.
- Impeccable decision page: URL in the chat message; it shows the same directions as cards and records your choice.
- Sketches are layouts, not builds: no motion, no responsive behaviour yet (that is milestone B).

## Directions

### Principal: "Contact confirmed" (QSL card world)

- World: the QSL card radio amateurs mail each other to confirm that a two-way contact happened: a call sign set large, a few
  labelled fields (time UTC, mode, report), two-colour print on card stock.
- Why it fits: ChatMee's real mechanism is confirmation. A message is only "sent" when the server echo with the same client id comes
  back (AC-004-5, AC-008-13). The world gives that a visible form without costume.
- Type: Borel wordmark; Geist for UI with the room name set large and tight like a call sign; Geist Mono, tabular, for every number
  and time.
- Palette roles: committed teal ink shell (header, own messages, primary action); one vermilion spot for live and unread
  ("ON AIR", badges); amber for reconnecting; crimson plus text for failures; cool white paper ground. Public pages invert to a
  teal-black ground with the card in paper white.
- Density: 320 px list, 56 px rows, grouped messages, labelled fields in the room header (members 12/50, on air, since).
- Signature move: the QSL confirmation tab under your own message. Dashed while sending, inked with the server time when confirmed,
  crimson "Not sent" with Resend / Discard. Reduced motion: no stamp press, states swap instantly. The header's "ON AIR / OFF AIR"
  replaces the floating connection banner.
- Landing: ChatMee's own QSL card (labelled demo data) lists a short exchange with the real STOMP frames from
  `docs/design/websocket-protocol.md`, then three rows of engineering facts. One action: Sign in with GitHub.
- Raises from declined challengers (Impeccable): from the data-sublime field, every number is tabular mono at one size and colour
  only marks state; from the cassette j-card, limits are printed (12/50 members; the 5000-character budget appears near the limit);
  from the streaming wall, focus discipline: the open room lifts with an ink bar while the rest stays quiet; from the bitmap specimen,
  one type ladder repeated at fixed steps; from the Crouwel grid, one 4 px grid and fixed column widths.
- Honest risk: the QSL reference is niche; it must read as "confirmed" to people who never saw a QSL card. The words stay plain
  ("Sending…", time, "Not sent"); "QSL" appears only as the small tab label and can drop to a check mark if you prefer.

### Alternative: "Registered airmail" (Impeccable's pick, colour changed per D-8)

- World: airmail envelopes and postmarks: red and blue chevron border, circular date postmarks, "posted / postmarked / returned".
- Type: same fonts. Palette: cobalt shell and own messages, post red for the primary action and unread, white ground; public pages
  navy.
- Organisation differs: top tabs (Chats / Discover), list tabs (All / Rooms / Direct), and a right-hand room panel.
  Note: the room panel content (members, about) belongs to CM-066; CM-084 would only lay out the slot.
- Signature move: the chevron strip at the top edge is the connection state (moves while reconnecting, still when live); date
  dividers are postmarks; delivery reads "Posted…", "Postmarked 14:01:12", "Returned to sender".
- Honest risk: the most familiar metaphor for messaging (envelope icons everywhere); red and blue chevrons are loud for a
  working screen and the red send button competes with unread badges.

### Reference only: the category standard (canon card)

Dark rail, grey list, teal bubbles. Shown so you can name what you do not want; not recommended.

### Grounded list and other dealt challengers

Agent's grounded worlds in resonance order (Impeccable rule: the roll, not the agent, picks which one leads): 1 registered airmail
(became the pick), 2 split-flap departure board, 3 telegram form with pasted tape, 4 QSL card (assigned by the roll), 5 pneumatic tube
post, 6 Swiss poster grid, 7 wire-service teletype (CM-082's world, treated as the rut).

Competitive, not sketched (budget: 1 + 1): the midnight transit diagram (rooms as coloured lines, messages as trains). Strong for the
landing's engineering story, weak for a dense chat list. Adoptable on request.

## Component and effect proposal (principal direction)

Evidence status: `discovered` → `source reviewed` → `live demo inspected` → `locally rendered` → `selected`.

| # | Role and screen | Approach | Candidate | Why | Adaptations | Deps, license | Alternatives | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | Delivery tab under own messages (workspace) | build custom | new `components/chat/DeliveryTab.tsx` from the reducer's `sending/sent/failed` | Signature move; no library has it | Reduced motion: no press animation | none | plain status text (today) | proposed |
| 2 | Air state in header (workspace) | reuse + restyle | `ConnectionBanner` logic, `useConnectionStatus` | Keeps the live region and tests | Move into header, tokens for amber/crimson | none | keep the floating banner | source reviewed |
| 3 | Room header fields (workspace) | reuse + restyle | `ChatHeader.tsx` | Data already there (members, online) | Labelled mono fields, capacity 12/50 | none | — | source reviewed |
| 4 | Room list rows (workspace) | reuse + restyle | `ChatRoomListItem.tsx`, `UnreadBadge` | Behaviour and tests exist | Ink focus bar, mono times | none | — | source reviewed |
| 5 | Dialogs, menus, inputs | reuse | `components/ui/*` (shadcn) | Accessible primitives | Tokens only, no edits to `ui/*` | existing | — | source reviewed |
| 6 | Landing demo exchange (public) | build custom or reuse | custom CSS sequence with `motion` (already a dependency), or `@magicui/animated-list` from the unmerged CM-082 branch | Plays the exchange once, then rests | Final state under reduced motion; `aria-hidden` on decoration | `motion` existing; Magic UI MIT | static table only | discovered |
| 7 | Toasts | reuse + restyle | `react-hot-toast` in `app/layout.tsx` | Hard-coded colours today | Token colours | existing | — | source reviewed |

No new dependencies proposed. Registry discovery (shadcn MCP) is unavailable this session; nothing above needs it.

## Gaps for decision (from Phase 2)

- G1: show "Can't reach ChatMee right now" on /login when the backend is unreachable (needs `authStore` to tell 401 from network errors).
- G2: redirect expired sessions to `/login?reason=expired` and say "Your session ended. Sign in again."
- G3: composer hint while reconnecting.
- G4: token migration of ~257 raw palette classes (spec-backed, AC-008-11), part of the build.

## Real versus mock

| Feature | Integration | Notes |
|---|---|---|
| Sketches | mock-only | static HTML, demo data labelled on the landing |
| Priority journeys | real (existing on `develop`) | not yet run full-stack in this run (milestone C) |

## Checks executed

| Check | Result | Evidence |
|---|---|---|
| Frontend gate on `develop` baseline | lint 0 errors / 15 warnings, tsc OK, 37 files / 222 tests, build OK | run 2026-10-14 in worktree |
| Sketches render at 1440 x 900 | OK; fixed a list-row overflow and a stretched card | Playwright MCP screenshots (main checkout `.playwright-mcp/cm084-*.png`, untracked) |
| STOMP destinations on the landing | match `docs/design/websocket-protocol.md` | grep of the protocol doc |

Not run: motion review (no motion in sketches), accessibility and responsive checks (milestone B), backend (milestone C, D-9).

## Decisions or feedback needed

1. Direction: principal "Contact confirmed" (recommended), alternative "Registered airmail", or re-roll.
2. Signature wording: keep the small "QSL" label on the confirmation tab, or use a plain check mark plus time.
3. Gaps G1..G3: build all three in CM-084 (recommended: small, inside the priority journeys), some, or none.
4. `PRODUCT.md`: approve as written or correct facts.
5. Landing demo animation: custom with `motion` (recommended, no new code from registries) or port CM-082's Magic UI list.

## Review states

| Part | State |
|---|---|
| Direction (both surfaces) | not reviewed |
| PRODUCT.md | not reviewed |
| Gaps G1..G3 | not reviewed |
| Journeys and state inventory | not reviewed |

## Usage

Working time about 1 h (agent). Waiting: one question round (Phase 1). Tool calls about 60; tokens: see the session usage panel
(not reported to the agent). Candidates: 7 grounded worlds listed, 6 catalog challengers dealt, 2 directions plus canon sketched,
0 registry components inspected. Review round 1. Rework: 2 small sketch fixes after self-review.
