# Decision log: ChatMee frontend (CM-084)

Newest first. A decision changes only through a new entry that supersedes it.

## D-14: Owner rejects the milestone B look; visual direction reopened (milestone B2)

- Date: 2026-10-14 · Phase: 3 (revisit) · Status: confirmed
- Decided by: owner chat after reviewing `/preview`, `/`, `/login` once more; answers to four agent questions
- Context: owner feedback: every page is too simple and boring, with no eye-catching effects or animation and no visible use of
  third-party components (React Bits and similar); the r7 lab variant looked better but still not enough. The landing only explains
  the system and stack and needs marketing. Creating rooms needs smarter, more convenient UX, and DMs must differ from rooms. The
  owner releases the milestone B design: nothing of it has to be preserved.
- Decision:
  1. Keep the "message confirmed" idea (check plus time, the delivery tab) as the brand hook; redo the look freely (palette, type
     scale, backgrounds, motion). Supersedes the visual parts of D-10, D-11 and D-12; D-13 stands for the concept only.
  2. Intensity: loud on public pages (landing, login: animated backgrounds, text reveals, spotlight cards, beams), lively but calm in
     the workspace (message arrival, send confirm, hover, room switch, presence).
  3. Dependencies: small effect libraries (for example ogl, gsap) allowed when an effect needs them, reason stated in the PR; no
     three.js-size packages without asking. Third-party code lives in `components/fx/` with a `PROVENANCE.md` row.
  4. Scope addition: split creation into "New message" (find a person, start or request a DM) and "New room"; DM conversations get
     their own presentation (person and presence in the header, no room fields). Frontend only, existing APIs. D-4 still holds for
     the requests inbox and safety UI.
- Consequences: milestone C is paused. A revised live preview (milestone B2) comes first, then milestone C on the accepted look.
- Revisit if: the owner rejects milestone B2.

## D-13: Owner chooses "Contact confirmed"; "Registered airmail" rejected

- Date: 2026-10-14 · Phase: 3 · Status: confirmed
- Decided by: owner chat, after a side-by-side live review of both builds
- Context: an alternative "Registered airmail" treatment was tried on branch `feat/CM-084-airmail-try` (worktree
  `../ChatMee-cm084-airmail`) against the milestone B "Contact confirmed" build (teal ink plus vermilion spot).
- Decision: the direction is "Contact confirmed". Airmail is rejected as too loud for a daily-use chat. Nothing is ported from the
  airmail branch; that branch and worktree are left untouched.
- Consequences: milestone C proceeds on the D-12 baseline. Owner-listed defects are fixed only as reported (no invented fixes).
- Revisit if: the owner reopens the direction.

## D-12: Owner freezes the milestone B version provisionally

- Date: 2026-10-14 · Phase: 3 · Status: provisional by owner
- Decided by: owner chat ("freeze this version for now, finish the remaining parts, we edit later")
- Decision: the milestone B look (tokens, workspace, landing, sign-in) is kept as the working baseline. The owner reported several things they find wrong but has not listed them; the design was authored by the agent without owner-supplied references (D-10 correction). Review states stay `not reviewed`.
- Consequences: Phase 4 migrates remaining screens to the same tokens; a later owner edit pass changes tokens and components centrally.
- Revisit if: the owner lists feedback or supplies references.

## D-11: Milestone B build choices

- Date: 2026-10-14 · Phase: 3 · Status: confirmed within delegated scope (agent), owner reviews at milestone B
- Decided by: agent (D-10 delegated the recommendations)
- Decision:
  1. Preview: a development-only route `/preview` (404 in production) renders the real workspace components on labelled mock data with a
     state switcher, because no backend runs before milestone C (D-9). It is temporary machinery and is deleted before milestone C.
  2. G1 needs `authStore` to tell "no session" from "server unreachable" (network error or 5xx from the /api rewrite): a new
     `unreachable` flag. This touches a store, which the ticket scoped out except for journey defects; recorded here as the one exception.
  3. G2: every in-app 401 (`apiClient`, STOMP ws-token) now lands on `/login?reason=expired`; `AuthGate` keeps `/login`.
  4. The delivery tab uses the list's own time format (HH:MM) for every state, so the tab and the conversation read the same; the
     existing UTC display test stays unchanged as the guard.
  5. The floating connection banner moved into the header as "On air / Reconnecting… / Off air · retrying"; its live region stays.
  6. Landing mobile: the From column folds into the message cell and the confirmation mark shows only its check below 640 px.
- Revisit if: the owner rejects the preview approach or any of the visible choices at milestone B.

## D-10: Milestone A answers: principal direction and agent recommendations adopted

- Date: 2026-10-14 · Phase: 3 · Status: provisional (owner confirmation pending, see D-12)
- Decided by: agent, under the owner's blanket delegation ("do everything as you recommend, I will edit later"). Corrected 2026-10-14: the owner did not choose these five items individually; item 2 was never proposed before and is the agent's own choice.
- Decision:
  1. Direction: principal "Contact confirmed" (QSL card world). The airmail alternative is rejected for this run (loud for a working
     screen, red action competes with unread).
  2. Delivery tab wording: plain check mark plus server time; no "QSL" label in the workspace (the reference is niche; plain words
     read as "confirmed" to everyone). The QSL card stays the landing's frame, where there is room to explain it.
  3. Gaps G1 (backend unreachable on /login), G2 (`/login?reason=expired` notice), G3 (composer hint while reconnecting) are in
     CM-084 scope.
  4. `PRODUCT.md` approved as written; the owner will correct facts later.
  5. Landing demo animation: custom, built on `motion` (existing dependency); no registry code, no new dependency.
- Consequences: milestone B builds tokens plus the principal components on the real code; Magic UI / CM-082 code is not ported.
- Revisit if: the owner edits any of the five answers.

## D-9: Backend for milestone C is run by the owner

- Date: 2026-10-14 · Phase: 1 · Status: confirmed
- Decided by: owner (Phase 1 Q4)
- Decision: at milestone C the owner starts Docker Desktop and the backend on :8080 with their own env. The agent runs the frontend from
  the worktree, the owner completes OAuth sign-in in the browser pane, the agent drives the rest. `./mvnw verify` runs once Docker is up.
- Revisit if: the owner cannot run the backend at C (then C is reported as not reached for real integration).

## D-8: Brand freedom: keep type, open colour

- Date: 2026-10-14 · Phase: 1 · Status: confirmed
- Decided by: owner (Phase 1 Q3)
- Decision: Borel stays the wordmark font, Geist and Geist Mono stay the UI fonts. The principal direction keeps teal; the alternative may
  change accent and palette. Work proceeds independently of the unrated CM-083 lab; when results arrive only the public-page direction
  is revisited.
- Revisit if: the owner reveals CM-083 results.

## D-7: Theme by surface

- Date: 2026-10-14 · Phase: 1 · Status: confirmed
- Decided by: owner (Phase 1 Q2)
- Decision: public pages (landing, login) fixed dark; workspace fixed light; one shared token set; no theme switch. Consistent with
  SPEC-008 §2 "dark mode" non-goal read as "no user-facing dark mode", and with the CM-082 precedent.
- Revisit if: the owner amends SPEC-008.

## D-6: Landing page as an owner-approved exception to SPEC-008 §2

- Date: 2026-10-14 · Phase: 1 · Status: confirmed (exception); spec amendment proposed
- Decided by: owner (Phase 1 Q1)
- Context: SPEC-008 §2 (Approved) lists "landing/marketing page" as v1+.
- Decision: build the landing on this branch as an owner-approved exception like CM-082. The Approved spec is not edited by the agent;
  a proposed amendment line is in the CM-084 ticket for the owner.
- Revisit if: the owner declines the amendment.

## D-5: Defaults used while the Phase 1 questions are open

- Date: 2026-10-14 · Phase: 1 · Status: superseded by D-6..D-9 (owner answered the same day)
- Decided by: agent within delegated scope (nonblocking defaults, SKILL.md Step 0.6)
- Context: the Phase 1 question batch (Q1 to Q4) went to the owner.
- Decision: until answered, work continues only on items not blocked by Q1 to Q4: Phase 2 journey and state inventory for the four
  priority journeys on the workspace. No public-page design, no visual direction work, no backend run.
- Alternatives considered: stop all work: wastes the wait; build on assumed answers: risks rework on a spec conflict.
- Consequences: milestone A starts after the owner answers Q1 and Q3.
- Revisit if: the owner answers.

## D-4: Cut room dialogs, requests inbox and safety UI from this run

- Date: 2026-10-14 · Phase: 1 · Status: proposed
- Decided by: agent proposal, owner to confirm
- Context: the owner named four priority journeys. Open v0 frontend tickets CM-066, CM-079, CM-080 cover invites, roles, DM requests,
  block/report/hide (SPEC-008 AC-008-8, -9; SPEC-009). None is part of the four journeys.
- Decision: keep them as separate tickets. The new visual system must not break their existing screens (dialogs keep working and get
  restyled through shared tokens and primitives only).
- Alternatives considered: fold them into CM-084: too large for one PR and outside the named journeys.
- Consequences: the v0 release (CM-067) still needs those tickets.
- Revisit if: the owner wants them in this run.

## D-3: Depth and entry phase

- Date: 2026-10-14 · Phase: 0 · Status: confirmed
- Decided by: owner chat (depth), agent (entry phase)
- Decision: enter at Phase 1 with full feasibility; full depth for the product-level direction (milestones A, B, C), standard depth
  per feature slice. Raised risk: realtime and session expiry need a full-stack check that has not run since CM-068.
- Revisit if: the owner changes the target level.

## D-2: The run is a redesign plus verification, not a new build

- Date: 2026-10-14 · Phase: 1 · Status: evidence-backed (BOARD.md CM-044, 045, 046, 048, 063, 064, 065, 068, 069 merged)
- Decided by: agent finding, reported to the owner
- Context: the brief called the frontend partial. The audit found all four priority journeys implemented on `develop` with 222 passing
  tests; what is missing is a deliberate visual system across both surfaces and an end-to-end run against the real backend.
- Decision: preserve stores, realtime layer, API clients and a11y behaviour; change presentation (tokens, chrome, component styling) and
  fix only defects the journey checks find.
- Consequences: existing tests stay as regression guards; markup-query updates are explained in the report.
- Revisit if: the full-stack run shows a journey is broken in a way that needs structural change.

## D-1: Ticket, branch and worktree

- Date: 2026-10-14 · Phase: 0 · Status: proposed (ticket number), confirmed (branch rules)
- Decided by: owner chat (branch rules), agent (ticket number)
- Decision: next free number CM-084; branch `feat/CM-084-frontend-delivery` from `develop` 41bbb29 in worktree
  `../ChatMee-cm084` (the main checkout stays on `lab/frontend-eval`). Ticket draft: `docs/plan/CM-084-frontend-delivery.md`.
- Revisit if: the owner prefers another number or name.
