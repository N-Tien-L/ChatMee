# Handoff: milestone B2 (revised live preview) · 2026-10-14

Why B2 exists: at the start of milestone C the owner rejected the milestone B look (D-14): too plain, no effects or third-party
components, landing too technical, room creation inconvenient, DMs indistinct. Milestone C (full-stack journeys) is paused until this
look is accepted.

## Scope completed

- **Look**: kept the "message confirmed" idea, redid everything else. Night-teal public pages with a luminous teal and an ember
  (vermilion) spark; a light, livelier workspace. New display font (Bricolage Grotesque) for headlines and titles.
- **Landing `/`** rewritten as marketing: WebGL light rays (React Bits LightRays), rotating audience word ("Chat with your team / study
  group / squad…", React Bits RotatingText), a looping demo room where your message goes "Sending…" then "✓ Confirmed 20:14" (the
  signature), animated border beam, crowd marquee, a beam diagram "Send once. Everyone sees it." (Magic UI AnimatedBeam), six
  spotlight feature cards (React Bits SpotlightCard), star-border call to action (React Bits StarBorder), a short "Under the hood"
  block for technical readers, closing call to action.
- **Login**: the same light rays, a glass card with a moving border beam, bigger provider buttons.
- **Workspace**: glowing header band with an "On air" pill; gradient identity avatars; rounded list rows; segmented All / Rooms /
  Direct filter with a sliding indicator; messages rise in; own bubbles in a teal gradient; the delivery tab confirms with an ember
  check that pops; typing bubble with bouncing dots; dotted conversation ground; empty states with a ripple.
- **Create flows split**: "Message" opens **New message** (recent people, search, one click; an existing DM opens directly, otherwise a
  DM request is created and opened). "Room" opens **New room** (name, Public / Private cards, size presets, optional description,
  "More options" folded, live preview card).
- **DMs read as people**: DM header shows the person with a presence dot and "Online now / Offline" plus "Waiting for them to accept"
  for a request; no room fields; inside a DM, no repeated name and avatar on each message and a person intro at the top; DM list
  previews drop the "Name:" prefix.

## How to view

Dev server on port 3084 (`.claude/launch.json` entry `cm084-frontend`).

| Page | URL | Data |
|---|---|---|
| Landing | http://localhost:3084/ | static, demo room labelled DEMO DATA |
| Sign-in | http://localhost:3084/login | real backend (:8080) |
| Expired session | http://localhost:3084/login?reason=expired | real (G2 notice observed against the real backend) |
| Workspace preview | http://localhost:3084/preview | mock, labelled MOCK DATA · PREVIEW |

On `/preview`, the control panel now has **Open chat**: room / direct (Lan Pham) / direct request (Khoa Vu). Try **Message** and
**Room** in the sidebar (mocked: search people with any letter; creating adds a room locally and then routes to `/dashboard`, which
needs sign-in).

## Real versus mock

| Feature | Integration |
|---|---|
| Landing demo room, beams | static demo, labelled |
| Sign-in, G2 notice | real |
| Workspace on `/preview` | mock-only |
| `/dashboard` with the new look, New message / New room | real code, not yet run against the backend (milestone C) |

## Checks executed

| Check | Result | Evidence |
|---|---|---|
| Lint | 0 errors, 12 warnings (was 16) | `npm run lint` |
| Typecheck | OK | `npx tsc --noEmit` |
| Unit tests | 37 files, 225 passed (one query renamed: "New group" → "New room") | `npx vitest run` |
| Build | OK | `npm run build` |
| Layout 1440 and 360 | no horizontal overflow | `evidence/milestone-b2/*.jpg` |
| Reduced motion (emulated, confirmed `true` in page) | light rays not mounted, headline static, demo shows the finished conversation, marquee still | Playwright evaluate |
| Console | no errors on `/`, `/preview`; `/login` only the expected 401 from `/api/v1/auth/me` | Playwright console |

Not run: full-stack journeys, keyboard and screen-reader pass, `./mvnw verify`, Impeccable finish review (all milestone C).

## Known limitations

- The rotating headline chip changes width per word, so the line reflows slightly every 2.4 s.
- New room: settings under "More options" (file sharing, guests, moderation) are sent as before; whether the backend enforces them was
  not checked in this run.
- Creating from `/preview` leaves the preview (routes to `/dashboard`).
- Room info and room settings dialogs were not restyled further than the milestone B token migration.

## Decisions or feedback needed

One reply, any form:

1. Does this look pass now (landing, login, workspace)? If not, what still feels wrong, ideally with a reference you like.
2. New message / New room: is this the convenience you meant?
3. Once accepted: start milestone C (sign in on the dashboard so I can run the journeys).

## Review states

| Part | State |
|---|---|
| Direction concept (D-14) | accepted |
| Landing, login, workspace look (B2) | not reviewed |
| New message / New room flows | not reviewed |
| DM presentation | not reviewed |
