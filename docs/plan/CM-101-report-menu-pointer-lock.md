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
