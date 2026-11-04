# SPEC-011: Session and privacy hardening for the M1 candidate
- Status: Approved (owner request in this chat, 2026-10-26; implementation/test evidence pending).
- Owner: @N-Tien-L · Created: 2026-10-26 · Related: SPEC-001/004/005/008/009; design/m1-session-and-privacy.md.

## 1. Goal
Close the discussed session revocation, global presence, same-account tab synchronization
and inbound ordering gaps after fixing CM-100/101. Owner selected current-session logout,
not account-wide/device-wide logout. The request authorizes this implementation scope;
it is not acceptance of residual gaps or release/deployment approval.
This additive post-v0 scope supersedes only the corresponding v0 deferrals for this
candidate. Historical Approved specs and accepted ADR text are preserved.

## 2. Non-goals
Shared HTTP sessions, multiple backend processes, logout-all-devices UI, new OAuth
providers, dependencies/framework upgrades, message sequence/replay guarantees, read
receipts, production operations and real-provider/device certification.

## 3. User stories
- US-1: Logging out ends every socket/token belonging to the current HTTP session;
  independent sessions of the same account remain usable.
- US-2: Only people sharing an active room may observe each other's presence.
- US-3: My other connected tabs reflect my block/unblock and DM-decline decisions.
- US-4: A subscription immediately followed by a send is processed in that order,
  while authentication/authorization rejections still produce a safe ERROR and close.

## 4. Acceptance criteria
- AC-011-1: A valid current-session logout or actual idle expiry prevents further
  inbound/outbound use by its sockets, closes them and revokes unused tokens; another
  independent session of the same account stays connected and can send.
- AC-011-2: A token remains single-use with at most 60-second TTL and is usable only
  while its issuing HTTP session remains valid. Rejected CSRF logout changes nothing.
  Session/token IDs and credentials never appear in application logs or native payloads.
- AC-011-3: The existing online-users snapshot and each presence frame disclose only
  the caller itself or people sharing an active PUBLIC/PRIVATE/ACTIVE DM room. An
  unaccepted DM request does not establish that relationship. Hidden active DMs retain
  membership; blocking still has the existing shared-group semantics.
- AC-011-4: Leaving/removal/deletion ends presence visibility when no other active
  shared room exists. Delivery rechecks authorization; database failure drops the frame.
  Lifecycle refetch replaces the browser's filtered presence set.
- AC-011-5: Block/unblock changes refresh the blocker's other connected tabs without
  notifying the blocked account of who blocked it. Declining refreshes the recipient's
  other tabs. Existing server send checks and generic errors remain authoritative.
- AC-011-6: Preserve inbound processing order per STOMP connection. Invalid/missing/
  reused tokens, forbidden subscriptions and Redis-unavailable authentication still
  return safe ERROR/close; no swallowed rejection or secret-bearing frame/log.
- AC-011-7: All repository gates and the complete isolated E2E command pass on the final
  named candidate; real Google/GitHub and physical mobile smoke remain owner checks.

## 5. Edge cases & Errors
| Scenario | Expected behavior |
| --- | --- |
| Two tabs sharing JSESSIONID | Both sockets end when that HTTP session ends |
| Same account in independent browser sessions | Logout ends only the issuing session |
| Token issue/CONNECT races with invalidation | Fail closed; no surviving binding |
| Pending token after backend restart | Rejected; reauthentication expected after restart |
| Redis down at token issue/consume | Existing fail-closed behavior |
| Presence registry unavailable | Filtered local fallback only; never broaden audience |
| Continuous room traffic | Existing bounded reconciliation, no new polling to hide races |

## 6. Security & Authorization
Identity and session are server-derived. No new permitAll/actuator endpoint, CSRF/CORS
relaxation, wider origin or client-supplied session authority. Current-session expiration
is checked without extending HTTP idle time through WebSocket heartbeats.

## 7. Non-functional
Retain one backend process. Token binding metadata expires with the token; disconnect
and session-end clean up owned mappings. Authorization checks stay uncached when doing
so avoids stale access. No production data migration or infrastructure subscription.

## 8. Related APIs / Protocols
POST /logout; POST /api/v1/auth/ws-token; GET /api/v1/online-users; existing STOMP
/topic/presence and /user/queue/events. Additive same-account invalidation event is
specified in the design/protocol before implementation; no new destination.

## 9. Open questions
No account-wide logout is authorized. OQ-02 release lineage, OQ-03 real-provider/device
smoke and final residual-risk acceptance remain owner gates.
