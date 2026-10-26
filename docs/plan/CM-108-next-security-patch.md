# CM-108: Apply the approved Next.js security patch
- Type: security. Priority: P1.
- Spec: SPEC-008 AC-008-12; SPEC-011 AC-011-7 (existing verification requirements; no contract change).
- Authorization: owner explicitly approved next and eslint-config-next 16.4.3 in this chat on 2026-10-26.
- Depends on CM-107 prepared dependency-resolution snapshot 9bbe28d; parent reporting revision 57a9b86.

## Goal
Replace the vulnerable Next 16.4.0 pair with the exact approved 16.4.3 patch and verify
the complete M1 candidate without disabling checks or altering application behavior.

## Scope
- In: next and eslint-config-next pinned to 16.4.3, required lockfile transitive changes,
  full repository/E2E gates, advisory evidence and readiness report.
- Out: other direct package upgrades, major versions, product features, auth/security
  relaxation, production smoke/access, push, PR, merge, rebase, tag or deployment.

## Expected Files to Touch
- frontend/package.json and frontend/package-lock.json.
- This ticket and docs/plan/V0.2-DEVELOP-READINESS-REPORT.md.

## Acceptance Criteria
- [ ] AC-1: Only the approved direct pair changes, matching locked Next tooling is 16.4.3 and npm ci succeeds.
- [ ] AC-2: Backend verify and frontend lint/tsc/test/standalone production build pass on one named revision.
- [ ] AC-3: Full isolated E2E passes with no retries/skips; production artifact exclusion and owned cleanup remain verified.
- [ ] AC-4: Fresh audit no longer flags next; remaining inherited advisories, exact candidate CI and production owner actions are reported accurately.

## Before-change reproduction
CM-107 standalone npm run build compiled/typechecked/prerendered then exited 1 with
SecurityFatalError from the Next16.4.0 agent upgrade nudge. The unchanged failure log
is backend/target/cm107-build.log; separate E2E 30/30 did not erase that failed command.
This patch is explicitly approved scope, not an inferred response to tool-output instructions.

## Follow-ups
Unrelated inherited dev-tool advisories require separate triage. Actual remote candidate
CI still needs separately authorized publishing/PR or applicable workflow trigger. Real
Google/GitHub, actual mobile and production sign-off remain owner actions.
