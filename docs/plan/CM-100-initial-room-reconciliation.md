# CM-100: Keep a newly created room reachable during initial reconciliation

- Status: Open; discovered by CM-097, implementation not authorized in the test ticket.
- Type: fix.
- Spec: Approved SPEC-008 AC-008-4/8; existing read-at-now and room-list contracts.
- Design: current room-list reconciliation; no new API/schema/protocol.
- Priority: P1. Depends on: CM-096; blocks CM-097 acceptance if reproduced.

## Goal

After a successful local room creation and navigation, show the room and composer once
server activity has settled. An initial snapshot/read race must not strand a quiet room
behind a stale snapshot Retry state.

## Reproduction and current evidence

On the CM-097 worktree, use the isolated production-build stack:

    cd frontend
    node node_modules/@playwright/test/cli.js test mobile.spec.ts --reporter=line

Failing browser test: `desktop keyboard / mobile_backNavigationAndOwnMenu_restoreConversation`.
The room POST returned 201; the following normal dashboard navigation never exposed
`textbox Message` within 15 seconds. Synthetic DOM diagnostics showed 0 rooms,
`Room activity changed during refresh. Please retry.` and `Room not found`, while the
connection was `On air`. No socket/API fault was injected in this scenario.
The broader real-stack journey run captured the failure after OAuth identities were
isolated per test. This is an observed race, not a claim that every execution fails.
The failing acceptance assertion is retained. Exact candidate/result SHAs and final
rerun outcomes are in V0.2-M1-HANDOFF-CM-097.md.

## Scope / expected files

Investigate `frontend/lib/stores/chatRoomsStore.ts`, its event tests and the actual
Dashboard/ChatRoomsList/StompProvider call sequence. Retain the existing browser
reproduction. Make a deterministic failing regression before changing production code.
No backend, Approved contract, new endpoint, dependency or shadcn edit is pre-authorized.

## Acceptance criteria

- [ ] Reproduce and identify the actual overlapping snapshot/read/lifecycle sequence.
- [ ] A newly persisted room opens after initial reconciliation without losing its row.
- [ ] Keep bounded retries, stale-generation rejection and correct unread/read semantics.
- [ ] Existing CM-095/096 regressions, full repository gates and E2E pass.

## Follow-ups

No production fix is included in CM-097/098. Do not weaken the browser assertion,
automatically reload until green, or assert this issue resolved from an unrelated pass.

## CM-100 implementation evidence (2026-10-26)

Owner authorized this fix in the follow-up after CM-099. A targeted instrumented run of
both retained duplicate/snapshot unread cases failed before their intended assertions.
Metadata showed Dashboard and first onConnected sharing a snapshot but starting separate
read PUTs; each read start/completion invalidated another snapshot attempt.

`fetchRooms_concurrentColdEntryCall_doesNotRestartReadDuringSnapshot` then reproduced
that exact two-caller sequence in 64 ms: RED, two read calls instead of one. Coalescing an
existing snapshot before starting its read work makes it GREEN without increasing the
three-attempt limit or removing any stale-generation guard. Temporary probes were removed.

- Focused CM-095/096/100 regressions: 6 files / 111 tests PASS.
- Original 105-message reconnect plus all four unread E2Es: 5 PASS, no retry, isolated stack.
- Logs: ignored `backend/target/cm100-{red,green,e2e,diagnosis-instrumented}.log`.
- Full candidate gates and complete E2E remain pending the separate CM-101 fix. This is
  an implementation commit, not a release-readiness or full ticket-completion claim.
