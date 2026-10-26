# CM-103: Authorize presence by shared active membership
- Status: Complete locally at candidate 40a3b88; release remains pending owner actions/remote CI.
- Type: security. Spec: SPEC-011 AC-011-3/4/7. Design: m1-session-and-privacy.md.

## Expected files
backend service PresenceVisibilityService.java; security PresenceSubscriptionInterceptor.java;
controller PresenceRestController.java; config PresenceWebSocketConfig.java; focused policy,
controller/interceptor tests and STOMP ITs; frontend/lib/realtime/StompProvider.tsx and tests;
frontend/tests/e2e/presence.spec.ts; design/websocket-protocol.md. Existing repositories only; no new dependency/destination.

## Acceptance criteria
- [x] Snapshot and each frame expose only self/shared active room members.
- [x] Unaccepted request/unrelated users cannot observe presence; hidden active DM retains membership.
- [x] Leave/remove/delete revoke visibility unless another active shared room remains.
- [x] Fail closed for authorization/malformed frame; reconnect/lifecycle replace filtered set.
- [x] Complete gates pass without broader origins, public endpoints or production calls.

## Membership invalidation detail

Inspection found that a person already online has no new presence transition when
joining a room. To update existing viewers and clear cached dots on departure without
polling, this ticket also names ParticipantService.java, UserEventPublisher.java and
PRESENCE_SCOPE_CHANGED {payload:{}} on the existing private user-events destination.
Send it to current members plus the departing member, or the captured pre-delete
membership. It contains no subject, room or activity details; only affected accounts
refetch their filtered snapshot. Add focused ParticipantService/Publisher tests and
retain existing room/typing revocation assertions. No new destination or public API.

## Implementation evidence (2026-10-26)

- RED real API: unrelated synthetic Alice/Bob were both returned in online-users.
- GREEN filtered REST snapshot after unrelated -> shared active room -> leave, using
  real local memberships/presence. The newly authored leave assertion was corrected to
  the existing controller's 200 response (not 204); privacy assertions were retained.
- 18 focused policy/interceptor/controller tests and 19 real STOMP/revocation ITs pass.
  After lifecycle invalidation: 54 focused service/policy tests and 11 provider tests pass.
- Real wire test verifies authorized/self delivery, outsider suppression, and immediate
  suppression after membership removal while the subscription/socket stays open.
- Joining an already-online person needs a snapshot invalidation, not a new presence
  transition. Added empty private PRESENCE_SCOPE_CHANGED to remaining/joining/leaving
  accounts; deletion already uses ROOM_REMOVED for captured members. A frontend RED
  missing-invalidation test is now GREEN. Older filtered responses cannot restore stale scope.
- Last shared-stack launch: presence case PASS; both newly authored CM-104 tab-safety
  cases FAIL as intended before that next ticket's implementation. Do not label the
  combined invocation a passing full suite.
- Logs: backend/target/cm103-{red-e2e,wire,focused-final,provider-final,presence-and-cm104-red}.log.
- Existing liveness probes now carry valid self-presence fields; original room/typing
  revocation assertions are unchanged. No dependency, new destination or production action.
- Full integrated gates remain pending CM-104/105; this is not release sign-off.

## Final candidate verification (2026-10-26)

Candidate 40a3b88: backend verify 618 unit/slice +107 IT PASS, coverage/packaging PASS;
frontend lint/strict TypeScript/447 tests/build PASS; exact npm run test:e2e 30/30 PASS,
no retries/skips. See [hardening report](V0.2-M1-HARDENING-REPORT.md) for per-AC,
commands, evidence and boundaries. Historical pending statements above refer to those
intermediate runs; this final result supersedes their local gate state only.
Remote CI, real providers/physical mobile and owner release sign-off remain pending.
