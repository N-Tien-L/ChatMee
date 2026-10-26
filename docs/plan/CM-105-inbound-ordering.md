# CM-105: Preserve inbound order without swallowing rejection errors
- Status: Authorized investigation/implementation; acceptance pending real wire tests.
- Type: fix. Spec: SPEC-011 AC-011-6/7. Design: m1-session-and-privacy.md.

## Expected files
backend security OrderedAuthChannelInterceptor.java, config WebSocketConfig.java;
AuthChannelInterceptorTest.java and StompMessagingIT.java; focused new wrapper tests;
design/websocket-protocol.md and evidence. No dependency/version/security relaxation.

## Acceptance criteria
- [ ] Subscribe immediately followed by send is processed in wire order.
- [ ] Missing/invalid/reused token, forbidden subscription and unavailable Redis send sanitized ERROR and close.
- [ ] Existing authorization and rate limits remain intact; token/native credentials never logged/reflected.
- [ ] Complete gates pass; if the workaround fails wire tests, retain the explicit gap rather than claiming success.

## Safe adapter and failure fallback

Also names WsSessionRegistry.closeSocket and WsSessionRegistryTest: if outbound ERROR
cannot be queued, close only the rejected transport, not its HTTP session or other tabs.
No raw exception/header/payload is copied into the ERROR. Read official Spring ordered
message guidance and exact 7.0.9 StompSubProtocolHandler/Error-close source; the installed
version's wire tests remain the acceptance authority. Flag-only testing also revealed
private user-queue mutability failures, which must remain visible if not resolved.

## Native prototype evidence (2026-10-26) — NOT ACCEPTED

This branch deliberately preserves the native strategy and unchanged failing integration
assertions for review. Do not integrate or call CM-105 complete from its focused passes.

- Unordered real-wire latch test RED: SEND overtook the held SUBSCRIBE.
- Flag alone RED: 1 failure + 4 timeout errors across 6 wire cases (ERROR/close and private delivery).
- Safe adapter + flag: 30 focused tests PASS; after additional categories/fallback,
  42 focused tests PASS in the integration invocation.
- Real multi-session IT gate then FAILS: 21 ITs, 3 failures. Existing private-error,
  removal-event and all-member-session activity tests cannot establish their second
  subscription. Spring logs Expected mutable SimpMessageHeaderAccessor. These original
  tests remain intact; this is an additional compatibility failure, not successful ordering.
- Full frontend lint/TypeScript/447 tests PASS; these cannot substitute for the red IT gate.
- Logs: cm105-{flag-only-red,order-red-final,adapter-wire-final,wire-it}.log; all ignored.
- Owner choice pending: one inbound worker for low-traffic M1 (global head-of-line blocking),
  or a dedicated compatibility/upgrade investigation retaining parallel workers. No upgrade
  or workaround that breaks private queues is accepted automatically.

Primary references: [Spring ordered messages](https://docs.spring.io/spring-framework/reference/web/websocket/stomp/ordered-messages.html),
[7.0.9 STOMP handler](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-websocket/src/main/java/org/springframework/web/socket/messaging/StompSubProtocolHandler.java),
[7.0.9 ordered channel](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-messaging/src/main/java/org/springframework/messaging/simp/broker/OrderedMessageChannelDecorator.java).
The installed-version tests above are authoritative for this prototype's failure.

## Owner-selected implementation (2026-10-26)
Owner chose one STOMP inbound worker for M1's small audience after native prototype
failed 3 unchanged multi-session ITs. See ADR-0008. Keep original interceptor and
ERROR/close path; no native wrapper/flag or dependency upgrade.
Expected final files: WebSocketConfig.java, AuthChannelInterceptorTest.java, ADR-0008,
this ticket, m1-session-and-privacy design. Integrated fixture compatibility:
RoomMembershipIT must bind a valid synthetic HTTP/socket session before checking
room denial; SubscriptionRevocationIT must assert both new scope invalidation and
unchanged ROOM_REMOVED payload, no extra owner/room frames. No assertion disabled.
Final verification pending.
