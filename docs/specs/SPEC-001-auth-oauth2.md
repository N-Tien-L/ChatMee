# SPEC-001: Authentication with OAuth2 (Google, GitHub)
- Status: Draft
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
- AC-001-2: Given an existing user, When they log in again, Then `name`/`avatarUrl` are updated and no duplicate is created, even for two concurrent logins (unique index). -> Partially implemented: the upsert updates the profile; no unique index on `(provider, providerId)` and no concurrency test. Planned: none
- AC-001-3: `GET /api/v1/auth/me` returns 200 with `{id, name, email, avatarUrl, provider}` when signed in, and 401 ProblemDetail when not. -> Implemented. Test: `AuthControllerWebMvcTest#getCurrentUser_knownUser_returnsOwnProfile`, `AuthControllerWebMvcTest#getCurrentUser_unauthenticated_returns401ProblemWithoutRedirect`. Note: `/api/v1/auth/status` stays public and returns `false` for guests (`AuthControllerWebMvcTest#getAuthStatus_anonymous_returnsFalse`).
- AC-001-4: `POST /logout` destroys the session (GET does not log out). -> Implemented. Test: `CsrfSecurityTest#postLogout_redirects`, `CsrfSecurityTest#getLogout_doesNotLogout`
- AC-001-5: A failed callback redirects to `/login?error=true` and the frontend shows a toast. -> Partially implemented: Spring's default failure redirect; no test. Planned: none
- AC-001-6: The session cookie is `HttpOnly`, `Secure` (prod) and `SameSite=Lax`; CSRF is enabled for state-changing requests. -> Implemented (cookie flags in `application-prod.properties`; SPA cookie CSRF from CM-010). Test: `CsrfSecurityTest#postWithoutCsrf_returnsForbidden`, `CsrfSecurityTest#postWithSpaToken_returnsOk`, `CsrfSecurityTest#postWithMismatchedSpaToken_returnsForbidden`
- AC-001-7: Logs never contain session ids, emails or raw OAuth attributes. -> Implemented (CM-010 removed the sensitive statements; CM-051b adds only `requestId`/`userId` to the MDC). Test: none (code review, see SEC-REVIEW of 2026-10-09).
- AC-001-8: The caller's identity in every API comes from the session principal (`UserPrincipal`, internal user id), never from the request body. -> Implemented. Test: `CurrentUserArgumentResolverTest#resolveArgument_userPrincipal_returnsInternalId`, `ControllerArchitectureTest#controllers_allClasses_haveNoRepositoryFieldsOrOAuth2UserParameters`

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| GitHub hides the email | `email = null`, the UI still works | 200 |
| Session expired mid-use | API answers 401, the frontend goes to `/login` | 401 ProblemDetail |
| Old session holding a pre-CM-040 principal | Treated as unauthenticated | 401 (`AuthControllerWebMvcTest#getAuthStatus_oldSession_returns401Problem`) |
| No session cookie on `/dashboard` | `middleware.ts` redirects to `/login` (UX only) | 307 |

## 6. Security & Authorization
- `/api/**` returns 401/403 ProblemDetail without redirects; browser routes keep the `/login` entry point.
- Users are matched only by `(provider, providerId)`; no account linking by email.
- The WebSocket is authenticated separately with a single-use token (ADR-0004, SPEC-004).

## 7. Non-functional
- The OAuth endpoints, `/api/v1/auth/status` and health probes are not rate limited (CM-057), because every anonymous visitor shares the Vercel egress address.

## 8. Related APIs / Protocols
docs/design/error-handling.md, docs/design/websocket-protocol.md, OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Add a unique index on `users(provider, providerId)` with a concurrency test (AC-001-2)?
- Should the login page show a toast for `?error=true` (AC-001-5)?
