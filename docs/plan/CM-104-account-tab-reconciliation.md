# CM-104: Reconcile block and decline across the account's connected tabs
- Status: Authorized; implementation pending.
- Type: fix. Spec: SPEC-011 AC-011-5/7. Design: m1-session-and-privacy.md.

## Expected files
backend service BlockService.java, DirectMessageRequestService.java, UserEventPublisher.java;
dto/response/UserEvent.java (or existing event DTO), focused service/IT tests;
frontend/lib/realtime/StompProvider.tsx, lib/stores/inboxStore.ts and focused tests;
frontend/tests/e2e/tab-safety.spec.ts; design/websocket-protocol.md.
Use existing room/inbox/block refetch actions; no dependency/new destination.

## Acceptance criteria
- [ ] Block/unblock invalidates only the blocker's own sessions; blocked-account UI receives no revealing event.
- [ ] Recipient decline removes the stale request from its other tabs via authoritative refetch.
- [ ] Existing block enforcement, generic errors and sender removal notification remain intact.
- [ ] Complete gates and two-page E2E pass; reconnect still reconciles missed events.

## Refetch/session boundary scope

Because this ticket starts additional private block/Inbox fetches, it also names
frontend/lib/stores/usersStore.ts, inboxStore.ts, authStore.ts and
accountSafetyCache.test.ts. Add explicit resetUserRequests/resetInboxState helpers and
generation guards so logout/cache reset invalidates pending responses, including the
same account signing in again. Existing clearSessionCaches omitted blockedUsers and
Inbox fields; record a failing privacy-cache regression before fixing it. Reject older
Inbox responses after a local decision/event rather than resurrecting declined requests.
This is private cache hygiene for these invalidations, not new messaging functionality.

## Implementation evidence (2026-10-26)

- RED real-stack two-tab cases: other-tab composer stayed enabled after block; other
  recipient Inbox retained a declined request. Both unchanged cases now PASS, including
  unblock and no revealing ACCOUNT_STATE_CHANGED event on the blocked account.
- ACCOUNT_STATE_CHANGED carries only BLOCKS/DM_REQUESTS and is sent to the actor/recipient's
  own sessions. Existing sender ROOM_REMOVED and generic server block enforcement remain.
- RED private cache tests: logout retained blocks/Inbox; old fetches restored state after
  same-account relogin; old Inbox snapshot resurrected a declined request. All three now
  PASS using explicit reset generations and stale-request guards. Existing tests retained.
- Focused backend service/publisher tests: 54 PASS. Frontend cache/auth/Inbox/user tests:
  26 PASS. Provider tests: 13 PASS. Strict TypeScript: PASS. Browser tab-safety: 2 PASS.
- Logs: backend/target/cm104-{cache-red,cache-final,backend-final,provider,tsc,e2e}.log;
  prior two-tab RED is in cm103-presence-and-cm104-red.log.
- Full integrated gates remain required after CM-105. No real provider/device smoke,
  remote CI, release operation or new dependency is claimed.
