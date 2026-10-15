# Handoff: milestone B (representative live preview) · 2026-10-14

## Scope completed

- Owner answers to milestone A recorded (D-10): principal direction "Contact confirmed", check mark plus time (no "QSL" label in the
  workspace), G1..G3 in scope, `PRODUCT.md` approved, landing animation custom on `motion`.
- Impeccable direction contracts written for both surfaces (`.impeccable/surfaces/`, seed `cfab315d`, code-led build: no comps,
  no image generation).
- Tokens: `frontend/app/globals.css` now holds one token set with two fixed scopes: `:root` (workspace, light) and `.theme-public`
  (landing and login, dark), plus `.theme-paper` for the card printed on the landing. New roles: `shell`, `spot`, `warning`,
  `danger-surface`, `success`, `highlight`.
- Principal workspace components rebuilt on the tokens: header band with the connection state ("On air", "Reconnecting…",
  "Off air · retrying"), room list rows (ink focus bar, mono times, vermilion unread), room header (name set large with labelled
  fields Room / Members 12/50 / Online), message list (date stamps, grouped bubbles, own messages in ink), the delivery tab (new
  `DeliveryTab.tsx`), composer, typing line.
- Public pages: new landing at `/` (was a redirect to `/login`) with ChatMee's own confirmation card; `/login` restyled on the dark
  surface, the WebGL background removed from the sign-in route.
- Gaps: G1 "Can't reach ChatMee right now" with Try again on `/login`; G2 `/login?reason=expired` with "Your session ended. Sign in
  again."; G3 composer hint while reconnecting.
- Not yet: dialogs (create room, discover, room info, settings) and user search keep their old colours (131 raw palette classes left,
  all in those six files); profile page; DESIGN.md and the Impeccable finish review (after your acceptance).

## How to view

Branch `feat/CM-084-frontend-delivery`, worktree `../ChatMee-cm084`. The dev server is running on port 3084 (`.claude/launch.json`
entry `cm084-frontend`; restart with `npm --prefix ../ChatMee-cm084/frontend run dev -- -p 3084`).

| Page | URL | Data |
|---|---|---|
| Workspace preview | http://localhost:3084/preview | mock, labelled "MOCK DATA · PREVIEW" |
| Landing | http://localhost:3084/ | static, card labelled "DEMO DATA" |
| Sign-in | http://localhost:3084/login | real: backend is down, so it shows G1 |
| Expired session | http://localhost:3084/login?reason=expired | G2 notice shows once the backend is up; G1 wins while it is down |

The preview control panel (bottom left) switches connection state, conversation state (populated, loading, load error, empty),
typing and "fail the next send". Clicking a room in the preview's list leaves the preview (it routes to `/dashboard`).

## Review scenarios

1. **Send and see it confirmed** (`/preview`): type a message, press Enter. The bubble is dashed with "Sending…", then after 1.2 s it
   turns ink and the tab presses in with a check and the time.
2. **A send fails** (`/preview`): tick "Fail the next send", send. The tab turns crimson "Not sent" with the reason; press Resend.
3. **Connection drops** (`/preview`): set Connection to reconnecting, then disconnected. Watch the header state and the composer hint;
   Send is disabled; set it back to connected.
4. **Find your place** (`/preview`): scan the room list: unread counts, the pending DM request, private room lock, times.
5. **First visit** (`/`): read the card as it prints in; does the headline plus card say what ChatMee is within seconds? Try it at
   phone width.
6. **Sign in** (`/login`): the unreachable notice and the two provider buttons.

## Real versus mock

| Feature | Integration | Notes |
|---|---|---|
| Workspace visuals on `/preview` | mock-only | real components, fixture rooms and messages, mock 1.2 s echo |
| `/dashboard` with the new styling | real, not yet run | needs the backend (milestone C) |
| Landing card | static demo | destinations match `docs/design/websocket-protocol.md`; labelled DEMO DATA |
| G1 on `/login` | real | observed against the real proxy with the backend down (500 from `/api/v1/auth/me`) |
| G2 redirect | real code, unit-tested | not yet observed end to end (milestone C) |

## Checks executed

| Check | Result | Evidence |
|---|---|---|
| Lint | 0 errors, 16 warnings (baseline 15; +1 in the temporary preview file) | `npm run lint` |
| Typecheck | OK | `npx tsc --noEmit` |
| Unit tests | 37 files, 225 passed (222 baseline + 3 new G1 tests; apiClient expiry test now expects `?reason=expired`) | `npx vitest run` |
| Build | OK, all routes static | `npm run build` |
| Layout at 1440, 768, 360 | no horizontal overflow on `/`, `/login`, `/preview` (landing at 360 overflowed 55 px, fixed) | `docs/frontend/evidence/milestone-b/*.png` |
| Console and network | no errors on `/` and `/preview`; `/login` shows the expected 500 from `/api/v1/auth/me` (backend down) | capture script report |
| Motion, normal | landing rows fade in one by one, last tab goes "Sending…" to "confirmed" at about 3 s, then rests; delivery tab stamp runs about 220 ms and finishes | `evidence/milestone-b/motion-samples.txt` (sampled opacity, playState, transform) |
| Motion, reduced (preference confirmed `true` in page) | landing card final at first sample after hydration; delivery tab swaps state with no animation | same file |
| Impeccable detector | no findings on changed targets | `impeccable detect --json` |
| Self-review | design-review checklist (Impeccable finish review runs after acceptance) | notes below |

Not run: full-stack journeys and `./mvnw verify` (milestone C, D-9), keyboard walk-through and screen-reader pass (milestone C),
performance measurement.

## Known limitations

- Landing: the card rows are rendered at opacity 0 on the server and fade in after hydration, so for about 0.1 s (and with JavaScript
  off) the table is blank; the reduced-motion sample at 100 ms shows this. To fix in Phase 4.
- Dialogs, user search and profile still use the old palette until Phase 4 (G4 migration).
- Motion durations live in CSS and component props; motion tokens come with the standardisation step.
- The browser pane could not render screenshots reliably this session; captures were made with a headless Chromium script instead.

## Decisions or feedback needed

One consolidated reply, any form:

1. Workspace on `/preview`: accept, or what feels wrong (density, colour weight of the teal header, bubble shapes, the tab)?
2. Landing on `/`: accept the headline, card and three facts, or name changes.
3. Sign-in on `/login`: accept.
4. Anything that must change before I migrate the dialogs and run the full-stack journeys (milestone C needs you to start Docker and
   the backend on :8080, D-9).

## Review states

| Part | State |
|---|---|
| Direction (D-10) | accepted (owner chat, may edit later) |
| PRODUCT.md | accepted (owner chat, may edit later) |
| Workspace preview | not reviewed |
| Landing | not reviewed |
| Sign-in and G1/G2 notices | not reviewed |
| Composer hint (G3) | not reviewed |

## Usage

Working time about 1.5 h (agent) for milestone B. Tool calls about 90. Tokens: see the session usage panel. Review round 1 of 2.
Rework: 2 test-driven adjustments (login title copy, tab time format), 1 overflow fix at 360 px, 1 icon colour fix.
