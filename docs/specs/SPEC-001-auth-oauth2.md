# SPEC-001: Authentication with OAuth2 (Google, GitHub)
- Status: Approved (2026-10-12, v0 decisions D-07..D-09 in docs/plan/MVP_V0_PLAN.md)
- Owner: @N-Tien-L · Created: 2026-10-09 · Related: ADR-0004, design/error-handling.md, design/websocket-protocol.md

## 1. Goal
Users sign in with Google or GitHub, without a ChatMee password. The backend creates or updates the user profile and keeps the session in an HttpOnly cookie. The SPA (Vercel) reaches the backend (Render) through same-origin rewrites.

## 2. Non-goals
- Local accounts or passwords.
- Linking several providers to one account (users are matched by provider and provider id only).

## 3. User stories
- US-1: As a guest, I click "Sign in with Google/GitHub" and land on the dashboard.
- US-2: As a user, I reload the page and stay signed in.
- US-3: As a user, I sign out and my session is destroyed.

## 4. Acceptance criteria
- AC-001-1: Given a first Google/GitHub login, When the callback succeeds, Then a `User` unique on `(provider, providerId)` is created and the browser is redirected to `/dashboard`. -> Implemented. Test: `CustomOAuth2UserServiceTest#loadUser_existingAndNewProviders_returnsSerializableInternalPrincipal`
- AC-001-2: Given an existing user, When they log in again, Then `name`/`avatarUrl` are updated and no duplicate is created, even for two concurrent logins (unique index). -> Partially implemented: the upsert updates the profile; no unique index on `(provider, providerId)` and no concurrency test. Planned: v1 (D-09; needs a production duplicate check before the index is created)
- AC-001-3: `GET /api/v1/auth/me` returns 200 with `ApiResponse<AuthResponse>` = `{data: {authenticated: true, user: {id, name, email, avatarUrl, provider}, message}}` when signed in, and 401 ProblemDetail when not. A 401 from this endpoint is the guest check; there is no separate status endpoint (`/api/v1/auth/status` was removed in CM-042, D-07, D-08). -> Implemented. Test: `AuthControllerWebMvcTest#getCurrentUser_knownUser_returnsOwnProfile`, `AuthControllerWebMvcTest#getCurrentUser_unauthenticated_returns401ProblemWithoutRedirect`, `AuthControllerWebMvcTest#getAuthStatus_removed_anonymousReturns401Problem`, `AuthControllerWebMvcTest#getAuthStatus_removed_authenticatedReturns404`
- AC-001-4: `POST /logout` destroys the session (GET does not log out). The client clears its local state only after the server confirmed the logout; a failed logout keeps the state and shows an error. -> Server implemented. Test: `CsrfSecurityTest#postLogout_redirects`, `CsrfSecurityTest#getLogout_doesNotLogout`. Client part: planned (CM-069)
- AC-001-5: A failed callback redirects to `/login?error=true` and the frontend shows a toast. -> Partially implemented: Spring's default failure redirect; no test. Planned: CM-069
- AC-001-9: A signed-in user who opens `/login` is sent to `/dashboard` with `router.replace` (no message, `/login` not kept in history). The decision comes from `/auth/me`, never from the cookie or a persisted flag; nothing auth-related in localStorage gates behaviour, and the WebSocket connects only after `/auth/me` succeeded. -> Planned: CM-069
- AC-001-6: The session cookie is `HttpOnly`, `Secure` (prod) and `SameSite=Lax`; CSRF is enabled for state-changing requests. -> Implemented (cookie flags in `application-prod.properties`; SPA cookie CSRF from CM-010). Test: `CsrfSecurityTest#postWithoutCsrf_returnsForbidden`, `CsrfSecurityTest#postWithSpaToken_returnsOk`, `CsrfSecurityTest#postWithMismatchedSpaToken_returnsForbidden`
- AC-001-7: Logs never contain session ids, emails or raw OAuth attributes. -> Implemented (CM-010 removed the sensitive statements; CM-051b adds only `requestId`/`userId` to the MDC). Test: none (code review, see SEC-REVIEW of 2026-10-09).
- AC-001-8: The caller's identity in every API comes from the session principal (`UserPrincipal`, internal user id), never from the request body. -> Implemented. Test: `CurrentUserArgumentResolverTest#resolveArgument_userPrincipal_returnsInternalId`, `ControllerArchitectureTest#controllers_allClasses_haveNoRepositoryFieldsOrOAuth2UserParameters`

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| GitHub hides the email | `email = null`, the UI still works | 200 |
| Session expired mid-use | API answers 401, the frontend goes to `/login` | 401 ProblemDetail |
| Old session holding a pre-CM-040 principal | Treated as unauthenticated | 401 (the earlier test was removed with `/auth/status` in CM-042) |
| No session cookie on `/dashboard` | `proxy.ts` (Next 16, formerly `middleware.ts`) redirects to `/login` (UX only) | 307 |
| Stale session cookie on `/login` | Form is shown, no redirect loop (the redirect waits for `/auth/me`) | 401 then form |
| `ws-token` answers 401 | Client stops reconnecting and goes to `/login` (SPEC-008 AC-008-14) | 401 |

## 6. Security & Authorization
- `/api/**` returns 401/403 ProblemDetail without redirects; browser routes keep the `/login` entry point.
- Users are matched only by `(provider, providerId)`; no account linking by email.
- The WebSocket is authenticated separately with a single-use token (ADR-0004, SPEC-004).

## 7. Non-functional
- The OAuth endpoints and health probes are not rate limited (CM-057), because every anonymous visitor shares the Vercel egress address.

## 8. Related APIs / Protocols
docs/design/error-handling.md, docs/design/websocket-protocol.md, OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Resolved 2026-10-12: unique index on `users(provider, providerId)` is v1 (D-09). The `?error=true` toast is in v0 (CM-069).
- Account deletion (`DELETE /api/v1/users/me`) and profile editing are v1 (V1_BACKLOG); profile editing conflicts with AC-001-2.
