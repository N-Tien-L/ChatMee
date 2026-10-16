# CM-084: Unify the frontend visual system and verify the priority journeys
- Status: merged to develop, awaiting smoke (2026-10-15: code complete, automated gates green; AC-1/AC-2 browser evidence pending)
- Type: feat
- Spec: SPEC-001 (AC-001-1, -4, -5, -9), SPEC-002 (AC-002-2..4), SPEC-004 (AC-004-3..8), SPEC-008 (AC-008-2, -4, -10, -11, -13, -14)
  · Design: docs/design/ui-workflow.md, docs/frontend/context.md · ADR: none
- Priority: P1 · Estimate: L
- Depends on: CM-063, CM-064, CM-065, CM-068, CM-069 (all merged)

## Goal
Give ChatMee one deliberate visual system that holds on a public page and on the dense chat workspace, and prove the four priority
journeys (OAuth sign-in, browse and join rooms, realtime room messaging, reconnect and expired-session recovery) against the real backend.

## Scope
- In scope: tokens in `app/globals.css`; app chrome and styling of `components/common`, `components/room` list and discover,
  `components/chat`, `components/realtime`; `/login`; public landing page (pending Q1); `components/fx/*` with provenance.
- Out of scope: backend; stores, realtime protocol and API clients (except defects found by the journey checks); CM-066, CM-079,
  CM-080 features; `components/ui/*`; deploy.

## Expected Files to Touch
- `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/app/login/*`, `frontend/app/dashboard/*`
- `frontend/components/common/*`, `frontend/components/chat/*`, `frontend/components/room/ChatRoomsList.tsx`, `ChatRoomListItem.tsx`,
  `DiscoverRoomsDialog.tsx`, `frontend/components/realtime/ConnectionBanner.tsx`, `frontend/components/LoginForm.tsx`
- `frontend/components/fx/*`, `frontend/components/PROVENANCE.md` (new, only if a component is adopted)
- Added at milestone B (D-11): `frontend/components/chat/DeliveryTab.tsx`, `frontend/components/landing/QslCard.tsx`,
  `frontend/lib/stores/authStore.ts` (G1), `frontend/lib/api/apiClient.ts` and `frontend/lib/realtime/StompProvider.tsx` (G2), tests for
  both; `frontend/app/preview/*` (temporary, deleted before milestone C)
- `docs/frontend/*`

## Acceptance Criteria
- [ ] AC-1: Each priority journey passes in a browser against the local backend with no failed requests and no console errors
      -> evidence in `docs/frontend/evidence/` and the milestone C handoff.
- [ ] AC-2: Session expiry (session cookie removed) lands on `/login`, not an endless "Reconnecting" (AC-008-14).
- [ ] AC-3: Tokens only in app components (no raw palette classes), layout works at 360, 768 and 1440 px, reduced motion honoured.
- [ ] AC-4: Existing a11y behaviour (role="log", focus return, live regions) survives; existing tests pass or have explained query updates.
- [x] `./mvnw verify` and `npm run lint && npx tsc --noEmit && npm test && npm run build` are green.
      -> 2026-10-15: backend `./mvnw verify` BUILD SUCCESS on develop 7aeffae (105 tests, 0 failures); frontend lint (0 errors, 11 warnings), tsc, vitest and build pass on 34521c6; `/preview` route removed.
- [ ] `docs/frontend/*` updated; spec AC lines updated only where the owner approves.

## Technical Notes / Hints
- Workflow: frontend-delivery skill v0.1 (pilot), milestones A, B, C.
- Known gaps not fixed here: `POST /rooms/{id}/members` still called by RoomSettingsDialog (CM-066); WS-A14 ordering (v1).

- Owner decisions 2026-10-14: landing is an exception to SPEC-008 §2 (D-6); public pages dark, workspace light (D-7); type fixed,
  colour open (D-8); owner runs the backend at milestone C (D-9).
- Proposed SPEC-008 amendment for the owner (not applied): "§2: the public landing page moves into v0 as a static page (CM-084);
  public pages use a fixed dark theme, the workspace a fixed light theme; a user-facing dark mode stays v1+."

## Verification status (2026-10-15)
- Done: automated gates (see above). Pending, owner-run against the real backend: AC-1 (sign-in, browse/join rooms, realtime messaging, Room info, Room settings, profile), AC-2 (session expiry lands on `/login`), AC-3 viewport and reduced-motion check, AC-4 a11y spot check.
- Spec status: SPEC-001/002/004/008 AC lines are not changed; they move to `Implemented` only after the smoke evidence is recorded and the owner approves.

## Follow-ups (New findings, DO NOT do in this ticket)
