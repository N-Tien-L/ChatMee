# CM-101: Investigate pointer lock after reporting from a message menu

- Status: Open investigation; discovered by CM-097; no production fix in CM-097/098.
- Type: fix.
- Spec: Approved SPEC-008 AC-008-10/11; SPEC-009 AC-009-20.
- Priority: P1 if confirmed; intermittent in current browser evidence.

## Reproduction and evidence

Run `node node_modules/@playwright/test/cli.js test mobile.spec.ts --reporter=line`
from frontend against the isolated full stack. `mobile_chatInputAndActions_remainReachable`
opens a received message's menu, copies its text, opens Report, selects Spam and submits.
The actual backend returned 202 and the dialog disappeared. In two initial runs,
clicking the next own-message menu remained blocked: first a closed dialog overlay,
then the document html element intercepted pointer events until the test timeout.
The session-expired page after that timeout is a consequence, not the initial symptom.

A subsequent desktop run passed after adding an observable body pointer-events
restoration assertion. This is insufficient to conclude a product fix: no production
code changed, and a transient state or menu/dialog lifecycle race may remain.
The acceptance test retains both the restoration assertion and the following real click;
it is not skipped, forced through the overlay, or replaced with a mocked report.
See the CM-097 handoff for final candidate results and whether this investigation
still blocks acceptance. Physical-device behavior is unverified.

## Scope / expected files

Minimize the actual menu -> report dialog -> close -> next-action lifecycle in
`frontend/components/chat/MessageActions.tsx`, `ChatInterface.tsx` and
`frontend/components/safety/ReportDialog.tsx`. Inspect shadcn/Radix behavior read-only;
AGENTS forbids manual edits to components/ui. No dependency upgrade is pre-authorized.

## Acceptance criteria

- [ ] Establish a deterministic failing reproduction or explicitly characterize the race.
- [ ] Submit and cancel from the message menu restore pointer and keyboard interaction.
- [ ] Copy/time/menu rights, report 202 and focus restoration remain intact at desktop/360px.
- [ ] Retain the browser regression and pass full repository/E2E gates before closing.

## Follow-ups

Do not hide the race with fixed delays, forced clicks, disabled tests or global retry.
No Approved contract edit or feature expansion belongs to this investigation.

Final CM-097 evidence: on `fc0de58`, both desktop and 360px cases reproduced the
post-report click lock even after the observable body pointer-events check passed.
This confirms the investigation remains open; see the CM-097 handoff for exact results.

## CM-101 implementation evidence (2026-10-26)

Owner authorized this fix after CM-099. Real Radix menu+dialog tests reproduced two
competing focus traps; the initial unbounded run overflowed and only its exact owned
Vitest process tree was stopped. A test-only capture guard then bounded focus events:
submit/cancel both RED (43/42 transitions, limit 30), without changing product behavior.

Open Report from the menu's close-auto-focus lifecycle after its layer unmounts. Focus
the origin first and restore that message on dialog close. No timeout, forced click,
shadcn edit or dependency change. The two Radix versions remain as locked.

- Submit/cancel + existing report component tests: 9 PASS.
- All five real-stack desktop/360px mobile tests: PASS, including actual report 202,
  cancel, restored focus and the original next own-menu click.
- Full frontend lint / TypeScript / 440 unit tests: PASS; existing warnings retained.
- Backend verify: 586 unit/slice + 106 ITs PASS, coverage PASS.
- Complete combined E2E and independent production build are running; their final
  evidence will be recorded in the subsequent hardening handoff. Do not infer release
  acceptance or real mobile-device smoke from the focused viewport cases.
- Ignored logs: backend/target/cm101-{red-bounded,green,e2e,lint,tsc,vitest}.log and
  cm100-101-{verify,full-e2e,build}.log. Temporary CM-100 probes are absent.
