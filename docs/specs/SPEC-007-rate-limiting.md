# SPEC-007: Rate limiting
- Status: Draft
- Owner: @N-Tien-L · Created: 2026-10-09 · Related: ADR-0002, design/error-handling.md, design/websocket-protocol.md

## 1. Goal
Protect the API and the chat from floods and abuse, without letting one attacker lock other users out.

## 2. Non-goals
- Edge/CDN rate limiting, CAPTCHA.

## 3. User stories
- US-1: As the operator, I want a single user or address to be unable to overload the backend.
- US-2: As a user, I want clear feedback (and a retry time) when I am limited.

## 4. Acceptance criteria
- AC-007-1: REST: anonymous callers get 20 requests/min per remote address, signed-in users 100/min per user. Over the limit: 429 ProblemDetail with `Retry-After`; every counted response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. -> Implemented (CM-030). Test: `RateLimitingFilterTest#filter_exceededLimit_returns429ProblemWithoutContinuing`, `RateLimitingFilterTest#filter_underLimit_setsHeadersAndContinues`, `RateLimitingFilterTest#filter_authenticatedUser_keysOnUserName`, `RateLimitingIT#anonymousRequest_freshClient_isCountedExactlyOnce`
- AC-007-2: A forged `X-Forwarded-For` does not change the key (only Tomcat's trusted-proxy resolution, `server.forward-headers-strategy=native` in prod). -> Implemented. Test: `RateLimitingFilterTest#filter_spoofedForwardedFor_keysOnRemoteAddress`
- AC-007-3: STOMP: at most 10 chat messages per 5 s per user; over the limit the sender gets a private `RATE_LIMITED` error. -> Implemented (CM-056; typing 10/5 s and presence 20/60 s are dropped silently). Test: `WsRateLimitInterceptorTest#preSend_chatOverLimit_dropsFrameAndSendsRateLimitedErrorWithTempId`, `WsRateLimitIT#chatFrames_moreThanTenInOneWindow_dropsTheEleventh`
- AC-007-4: If Redis fails, requests pass (fail-open) and a WARN is logged. -> Partially implemented: fail-open and WARN exist; there is no metric. Test: `RateLimitingServiceTest#check_redisUnavailable_failsOpen`. Planned: none
- AC-007-5: `/actuator/health` is not rate limited. -> Implemented (CM-057, together with `/api/v1/auth/status` and the OAuth2 authorization/callback endpoints, because every anonymous visitor reaches the backend from the Vercel proxy address). Test: `RateLimitingIT#health_anonymous_isNotRateLimited`, `RateLimitingIT#oauthLoginRedirect_moreRequestsThanAnonymousLimitFromOneProxyAddress_neverReturns429`, `RateLimitingFilterTest#filter_loginAndHealthPaths_skipRateLimit`

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| Anonymous traffic through the Vercel rewrite | Shares one address bucket; only non-login anonymous paths are counted | 429 after 20/min |
| Over the STOMP chat limit | Frame dropped, connection stays open | private `RATE_LIMITED` error |

## 6. Security & Authorization
Keys: `user:<internal id>` for signed-in requests, `ip:<remote address>` otherwise, `ws:<user>:<destination>` for STOMP frames.

## 7. Non-functional
Fixed windows in Redis (`INCR` + `EXPIRE`); one Redis round trip per counted request.

## 8. Related APIs / Protocols
docs/design/error-handling.md (rate limiting), docs/design/websocket-protocol.md (inbound rate limits), OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Add a metric (Micrometer counter) for fail-open events (AC-007-4)?
- The owner should confirm which proxy headers Render forwards, to decide whether anonymous traffic can be keyed by the real client address.
