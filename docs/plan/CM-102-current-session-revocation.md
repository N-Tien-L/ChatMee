# CM-102: Revoke sockets and tokens for the current HTTP session
- Status: Complete locally at candidate 40a3b88; release remains pending owner actions/remote CI.
- Type: security. Spec: SPEC-011 AC-011-1/2/7. Design: m1-session-and-privacy.md.
- Owner scope: current session only; no logout-all-devices behavior.

## Expected files
backend security WsSessionRegistry.java, WsTokenService.java, AuthChannelInterceptor.java;
config WsSessionConfig.java, WebSocketConfig.java; controller AuthApiController.java;
focused security/controller tests and STOMP ITs, frontend/tests/e2e/auth.spec.ts;
design/websocket-protocol.md and evidence. No new dependency or security relaxation.
WsSessionRegistry may implement servlet listener and outbound authorization and provide
an owned transport decorator. WsSessionConfig registers the listener.

## Acceptance criteria
- [x] Logout closes every socket of the current HTTP session and rejects unused tokens.
- [x] Actual HTTP idle expiry closes/rejects that session; WS traffic does not refresh it.
- [x] Independent sessions of the same account and rejected CSRF logout remain usable.
- [x] Token TTL/single-use and issue/consume/invalidate races are tested fail closed.
- [x] Complete gates pass; no secret/session/token logging or production operation.

## Implementation evidence (2026-10-26)

- Current-session owner requirement recorded in SPEC-011; no logout-all-devices action.
- RED real-stack unused-token case: CONNECT succeeded after logout. RED raw-transport
  case: both sockets remained open without client cooperation. A normal sibling-tab
  case already passed the baseline through cooperative client cleanup, so it was not
  substituted for server revocation proof.
- GREEN: 54 focused security/controller tests, including 10 session-registry tests;
  all 13 auth E2Es with actual idle expiry, pending-token rejection, two forced closures,
  independent same-account login/send and rejected CSRF logout.
- New HttpSession listener, token/socket ownership, reauthentication and outbound guards
  preserve current APIs/origins/CSRF and one-instance deployment. No dependency/migration.
- Existing wire-test fixture now creates explicit synthetic HTTP-session bindings; old
  permission assertions are retained and new per-frame authorization calls asserted.
- Ignored logs: backend/target/cm102-{red-e2e,server-revocation-red,focused-green,auth-e2e}.log.
- Full integrated gates remain required after CM-103..105. No release readiness claimed.

The preceding CM-100/101 candidate at 4b5b789 passed backend 586+106/coverage, frontend
lint/TypeScript/440 tests/build and exact npm run test:e2e: 24 PASS, no retries/skips.
Logs: cm100-101-{verify,full-e2e,build}.log and cm101-{lint,tsc,vitest}.log.

## Final candidate verification (2026-10-26)

Candidate 40a3b88: backend verify 618 unit/slice +107 IT PASS, coverage/packaging PASS;
frontend lint/strict TypeScript/447 tests/build PASS; exact npm run test:e2e 30/30 PASS,
no retries/skips. See [hardening report](V0.2-M1-HARDENING-REPORT.md) for per-AC,
commands, evidence and boundaries. Historical pending statements above refer to those
intermediate runs; this final result supersedes their local gate state only.
Remote CI, real providers/physical mobile and owner release sign-off remain pending.
