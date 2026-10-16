# CM-088: Stabilize room and people search dialogs while typing
- Type: fix
- Spec: SPEC-006 (search, 300 ms debounce), SPEC-008 (AC-008-8, AC-008-11)
- Priority: P2 · Estimate: S
- Branch: `fix/CM-088-search-dialog-jitter`
- Authorization: owner bug report, 2026-10-16.

## Goal
Prevent the list skeletons flashing on every search request while typing. Preserve existing rows during refresh, with a small search indicator and disabled stale actions. Also keep dialog geometry stable.

## Scope
- In scope: stable loading feedback and scrollable result space in the existing room and people search UI; component and browser regression tests using local fixtures.
- Out of scope: API/store behavior, new dependencies, visual redesign, shared shadcn components, release operations.

## Expected Files to Touch
- `frontend/components/user/UserSearchList.tsx`
- `frontend/components/room/NewMessageDialog.tsx`
- `frontend/components/room/DiscoverRoomsDialog.tsx`
- `frontend/components/user/UserSearchList.test.tsx`
- `frontend/components/room/DiscoverRoomsDialog.test.tsx`
- `frontend/tests/browser/search-dialog-stability.js`
- This ticket (verification evidence).

## Acceptance Criteria
- [x] AC-1: Typing through loading/empty/results/error does not move either dialog or its input by more than 1 px. Test: `search-dialog-stability.js`.
- [x] AC-2: Input keeps focus and identity; many results scroll inside the viewport at mobile, tablet and desktop widths. Test: `search-dialog-stability.js`.
- [x] AC-3: Search requests do not replace existing rows or empty states with skeletons; stale result actions are disabled while refreshing. Tests: `UserSearchList.test.tsx`, `DiscoverRoomsDialog.test.tsx`, `search-dialog-stability.js`.
- [x] Frontend lint/tsc/test/build pass (2026-10-16: 374 tests, build compiled; backend untouched, verified on develop after merge).

## Technical Notes
Approved search and messaging contracts remain unchanged. Reproduce the layout bug before editing components; use fixtures rather than real accounts.
Owner clarification: the reported jitter is the repeated skeleton/list replacement, not just modal movement. Geometry-only verification did not establish that this symptom was fixed.

## Follow-ups
- The earlier Turbopack PostCSS build failure did not reproduce on 2026-10-16 (build passes in the main checkout and in worktrees); it was environmental.

## Verification (2026-10-16)
- Red before the component fix: `browser_run_code_unsafe({filename: "frontend/tests/browser/search-dialog-stability.js"})` failed across all eight dialog/viewport combinations. A minimal empty-query cycle moved the DM input about 24.4 px and the room input about 18 px vertically. Input identity/focus remained intact; changing content height moved the centred dialog.
- Green after the fix: same script, 96 loading/resolved samples, maximum change in dialog/input position or size **0 px**. Viewports: 360x800, 768x900, 1440x900, 768x420. Empty, one result, 20 results and HTTP 500 states; input focus/identity, viewport containment and result scrolling passed. Real UI/CSS with synthetic API fixtures, not live OAuth/backend acceptance.
- Frontend tests: 56 files, 370 tests passed.
- `npm run lint`: exit 0, 0 errors / 8 warnings in existing code.
- `tsc --noEmit`: exit 0.
- `git diff --check`: passed.
- Backend `mvnw.cmd verify`: BUILD SUCCESS; 581 unit/slice tests + 105 integration tests, no failures/errors/skips; JaCoCo checks passed.
- Build: failed as described above. The repository done gate is **not fully passed**.
- No commit, push, merge or deployment performed.

## Skeleton flicker correction (owner clarification)
- Correct symptom: each request unmounted the list and mounted three pulsing skeleton rows; the response replaced them again. Fixing geometry alone left this behavior intact.
- Red before this correction: `vitest run components/user/UserSearchList.test.tsx components/room/DiscoverRoomsDialog.test.tsx` produced 4 failures: existing result rows disappeared during refresh and skeletons appeared in empty searches.
- Fix: replace the skeleton branches with a small loading indicator inside each search input. Preserve result rows and empty states during refresh; disable Message/Block via the results fieldset and Join/Load more while loading. Search API and debounce stay unchanged.
- Green: all 9 focused component tests passed. Extended browser regression also passed all eight dialog/viewport combinations: no skeleton nodes during requests, previous result buttons stayed mounted and disabled, and geometry remained stable at 0 px change.
- Lint: 0 errors, 8 existing warnings. TypeScript: passed. Full frontend suite after restoring `aria-busy` on the loading status: 57 files, 374 tests passed.
- Backend source is unchanged; the successful verify run above still applies. Production build remains unverified due to the previously recorded Turbopack process initialization failure.
