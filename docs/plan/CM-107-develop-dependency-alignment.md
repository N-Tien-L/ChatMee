# CM-107: Align the M1 candidate with develop dependency updates
- Type: build.
- Spec: SPEC-008 AC-008-12; SPEC-011 AC-011-7 (unchanged Approved acceptance requirements).
- Priority: P2. Depends on CM-099 develop-readiness audit.
- Authorization: owner follow-up in this chat, 2026-10-26, to complete the reported integration conditions.

## Goal
Prepare a conflict-free dependency snapshot for the M1 candidate against fetched
origin/develop f0ecef5 without merging/rebasing or changing develop.

## Scope
Retain the existing remote dependency updates and the candidate's dropdown menu,
Playwright pin and scripts. Copy Maven wrapper files exactly from the already committed
remote revision; do not hand-edit generated wrapper code. No new package, major upgrade,
product feature, production access, credentials change, push, merge or deployment.
Advisory remediation beyond these existing updates remains a separate follow-up.

## Expected Files to Touch
- frontend/package.json and frontend/package-lock.json.
- backend/pom.xml and backend/.gitattributes (vendor wrapper byte preservation).
- backend/mvnw, backend/mvnw.cmd, backend/.mvn/wrapper/maven-wrapper.properties: exact upstream copies only.
- This ticket and docs/plan/V0.2-DEVELOP-READINESS-REPORT.md.

## Acceptance Criteria
- [x] AC-1: Remote dependency declarations remain, candidate-only dropdown/Playwright/scripts remain, npm ci validates the lock.
- [ ] AC-2: Wrapper files/pom match origin/develop exactly; read-only merge-tree preview has no conflicts.
- [ ] AC-3: Backend verify and frontend lint/tsc/test/build/full isolated E2E pass on the named aligned revision.
- [x] AC-4: Record exact code/reporting revisions, environment, current remote CI status and owner-only actions honestly.

## Follow-ups
Actual remote CI needs a published candidate and working read access. Prior prohibition
on push/merge remains. Real Google/GitHub, physical mobile and production sign-off are
owner checks. Do not rewrite Approved contracts or silently apply npm audit fixes.

## Upstream wrapper transfer detail
The remote mvnw.cmd blob already contains CRLF. Existing *.cmd text eol=crlf
normalizes it back to LF on comparison/staging, making a byte-identical upstream
checkout appear modified. Add a path-specific /mvnw.cmd -text attribute so the vendor
file remains byte-for-byte equal to origin/develop. No wrapper logic is hand-edited,
no Git configuration is changed, and other cmd files retain their existing rules.

## Verification outcome (partial acceptance)
- Code snapshot: 9bbe28d0eea61548c66949ea343cd874e9a7468e.
- Backend mvnw.cmd verify PASS: 618 unit/slice +107 IT, no failures/errors/skips,
  JaCoCo0.8.15, Maven3.10.0. Frontend lint/tsc/454 tests PASS.
- Standalone frontend build compiled/typechecked/prerendered, then exited1 with
  Next16.4.0 SecurityFatalError from its agent upgrade advisory nudge. This failed
  command is retained; no environment preference or security check was disabled.
- Separately required full npm run test:e2e PASS:30/30 in5.6m, retries0/skips0, at9bbe28d. Owned PID/port cleanup independently verified. Standalone build failure is retained; AC-3 is not complete.
- Current ort preview still reports textual conflicts in package.json/package-lock.
  This is not represented as a clean automatic merge. The two prepared resolutions
  applied through an isolated temporary Git index produce tree
  8e34b8165151eaa1c35f3fdb28b370d1c345ac77, identical to the candidate tree.
  No working branch merge/rebase or merge commit occurred. AC-2's automatic-conflict
  condition remains pending until an owner-authorized integration records resolution.
- GitHub connector still401; existing GitHub CLI read access works. Candidate runs=[];
  remote develop f0ecef5 has successful Backend/Frontend CI, which is not M1 CI evidence.
- Owner asked to confirm a separate targeted security patch to next and
  eslint-config-next16.4.3. No such patch has been applied without that confirmation.
