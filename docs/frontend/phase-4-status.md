# Phase 4 status (CM-084) · 2026-10-14

Baseline: the milestone B look, frozen provisionally by the owner (D-12). Owner edits come later and change tokens/components centrally.

## Done

- G4 token migration: no raw palette classes remain in `app/` and `components/` outside `components/ui/*` and the temporary `app/preview/*`
  (was ~257 at the start of the run; 131 left after milestone B). Dialogs (create room, discover, room info, settings) and user search use tokens.
- Unused `LoginBackGround` removed (the WebGL background is gone from the sign-in route).
- Landing card rows print in with a CSS animation instead of `motion`, so the table is visible without JavaScript and never blank before
  hydration (fixes the milestone B limitation). The `motion` hook is still used for the echo timer under reduced motion.
- Create-room modal and the discover dialog were rendered and checked visually (`evidence/milestone-b/dialog-*.png`).

## Checks

Lint 0 errors / 16 warnings; tsc OK; 37 files / 225 tests pass; build OK. No-JS landing rendered (`landing-nojs.png`).

## Known gaps

- With JavaScript off, the last landing row stays "Sending…" (the echo needs JS). Cosmetic.
- Room info and room settings dialogs were not rendered (they need member data from the backend); migrated by class mapping only.
- Profile page already used tokens; it has no app header (unchanged behaviour).
- `app/preview/*` stays until milestone C passes, then is deleted.

## Milestone B2 (2026-10-14, D-14)

The owner rejected the milestone B look at the start of milestone C. Revised look, marketing landing, split New message / New room
flows and a distinct DM presentation are built and ready for review: `milestone-b2/HANDOFF.md`. Milestone C waits for acceptance.

## Next: milestone C (blocked on the owner: B2 acceptance, then sign-in for the journeys)

Needs Docker Desktop and the backend on :8080 with the owner's env. Then: run the four journeys in a browser with console and
network capture, keyboard walk-through, `./mvnw verify`, Impeccable finish review, DESIGN.md, delete `/preview`.
