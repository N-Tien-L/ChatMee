# Decision log: ChatMee frontend (CM-084)

Newest first. A decision changes only through a new entry that supersedes it.

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
