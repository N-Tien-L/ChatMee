# Auth & Users: review findings and follow-up tickets

- Scope: endpoint group "Auth & users" (`/login`, `/oauth2/**`, `/logout`, `POST /api/v1/auth/ws-token`, `GET /api/v1/auth/me`,
  `GET /api/v1/users`, `GET /api/v1/users/{userId}`) and the frontend flows that use them.
- Source: review session of 2026-10-11/12. Specs: SPEC-001, SPEC-006, SPEC-008; ADR-0004.
- Status: **Triaged 2026-10-12.** Every finding is mapped to a ticket or to v1 in `docs/plan/MVP_V0_PLAN.md` ("Findings triage"); decisions in section 3 are answered there (D-07..D-09, D-19, D-21). The `CM-TBD-*` drafts below are historical: CM-TBD-A/B/C became CM-069. No code was changed by this review.
- Per `AGENTS.md`, this document does not edit any Approved spec. Spec conflicts are listed as decisions for the owner (section 3).

## 1. Verification summary (backend)

The backend endpoints behave as the specs describe.

| Endpoint | Result | Evidence |
|---|---|---|
| `GET /api/v1/auth/me` | Correct | `AuthControllerWebMvcTest`: own profile, 401 ProblemDetail without redirect, 404 when the user is gone |
| `POST /api/v1/auth/ws-token` | Correct | `AuthControllerWebMvcTest`: token with `Cache-Control: no-store`; 403 without CSRF; 401 unauthenticated |
| `GET /api/v1/users` | Correct | `UserApiControllerTest`, `UserServiceTest`: name search, caller excluded, no email, size clamped to 1..50 (default 20) |
| `GET /api/v1/users/{userId}` | Correct | `UserApiControllerTest#getUserById_notFound_returns404`; summary without email |
| `/oauth2/**`, `/login` | Correct | `CustomOAuth2UserServiceTest`; success redirects to `{client}/dashboard`, failure to `/login?error=true` |
| `POST /logout` | Correct | `CsrfSecurityTest` (POST logs out, GET does not) |

Not verified: `WsTokenServiceTest` and `AuthChannelInterceptorTest` reported `Tests run: 0` in surefire although the files contain
6 and 21 `@Test` methods (likely a `@Nested` reporting quirk). Re-run them alone (`./mvnw test -Dtest=WsTokenServiceTest`) and read the
real counts before relying on them for token single-use and CONNECT rejection.

Response shape reminder: `/auth/me` returns `ApiResponse<AuthResponse>` where `AuthResponse = {authenticated, user, message}` and
`user` holds `{id, name, email, avatarUrl, provider}`. The frontend (`authStore.checkAuthStatus`) matches this shape.

## 2. Findings

### Frontend logic

| ID | Severity | Location | Finding |
|---|---|---|---|
| F-1 | Medium | `lib/stores/authStore.ts` (`logout`), `lib/api/authApi.ts` (`logout`) | `logout()` calls `authApi.logout()` without `await`, then clears state and shows a toast immediately. If `POST /logout` fails (for example 403 CSRF) the error is an unhandled rejection, local state is cleared but the server session survives, and `/login` redirects back to the dashboard. The toast is lost on navigation. Same as audit M-8. |
| F-2 | Medium | `lib/stores/authStore.ts` (`persist`) | `isAuthenticated` is persisted to localStorage and can be stale. `StompProvider` connects when it is true, before `/auth/me` confirms it, so an expired session shows up as a `ws-token` 401 while the app still believes it is logged in. |
| F-3 | Medium | `components/LoginForm.tsx:48`, `app/login/page.tsx:35-38` | A logged-in user on `/login` sees only "You are already logged in!" with no action. The text comes from the persisted flag, so it flashes before `/auth/me` answers and stays while the backend is slow. The page then uses `router.push("/dashboard")`, which leaves `/login` in history and creates a Back-button loop. |
| F-4 | Low | `lib/realtime/stompSession.ts` (`beforeConnect`) | Any `getToken` failure goes to `scheduleReconnect`; 401 is not distinguished from network errors. Reconnect only stops today because the axios interceptor navigates to `/login`. Tracked as AC-008-14 in CM-068 (not done). |
| F-5 | Low | `lib/api/authApi.ts` | `login()` appends `?prompt=select_account` for every provider (GitHub ignores it). `loginWithAccountSelection` is unused and its Google logout URL is unreliable. `console.error` calls remain in `authApi`, `authStore`, `userApi`. |

### Spec vs code

| ID | Item | Detail |
|---|---|---|
| S-1 | `/api/v1/auth/status` | SPEC-001 AC-001-3 says it stays public and returns `false` for guests. The controller no longer has it; `AuthControllerWebMvcTest#getAuthStatus_removed_*` asserts 401/404. |
| S-2 | `/auth/me` body | SPEC-001 AC-001-3 documents a flat `{id, name, email, avatarUrl, provider}`. Code returns the nested `AuthResponse` above. Not yet confirmed which shape the test asserts. |
| S-3 | `GET /logout` | The endpoint table used in the review listed GET. The correct method is POST (AC-001-4). |
| S-4 | AC-001-2 | No unique index on `users(provider, providerId)`; concurrent first logins can create duplicates. Already recorded in SPEC-001 section 9. |

## 3. Decisions needed from the owner

1. S-1: drop `/auth/status` from SPEC-001 (recommended: `/auth/me` returning 401 is enough) or restore the endpoint.
2. S-2: change SPEC-001 to the nested `AuthResponse` shape (recommended: smallest change, frontend already depends on it) or flatten the response.
3. Whether to bring `users(provider, providerId)` unique index into v0 (S-4), or defer to v1.
4. Whether `DELETE /api/v1/users/me` needs a ticket before any public launch (see section 5).

## 4. Draft tickets

### CM-TBD-A: Silent redirect for signed-in users on `/login`
- Type: fix · Spec: SPEC-001 (US-2) · Priority: P1 · Estimate: S
- Depends on: CM-063 (it already reworks the login page and dashboard auth gate; do these together or after it)

**Goal.** A signed-in user who opens `/login` is sent to `/dashboard` without seeing any message, overlay or dead-end page, as GitHub,
Facebook, X, Discord and Slack do.

**Decision recorded.** Silent redirect, not a blocking overlay. Reason: users reach `/login` while signed in through Back, bookmarks
or old links; they want the app, and sign-out belongs in the app header (CM-063 user menu).

**Scope.**
- In scope: `/login` calls `/auth/me`; while pending it renders a skeleton/spinner (not the form, not "already logged in"); on 200 it calls
  `router.replace("/dashboard")`; on 401 it renders the form. Remove the "You are already logged in!" branch from `LoginForm`.
- Out of scope: any redirect away from `/login` in `proxy.ts`. The proxy only sees that a `JSESSIONID` cookie exists, not that the
  session is valid; a stale cookie would loop `/login -> /dashboard -> 401 -> /login` (see the comment in `proxy.ts`). The redirect
  must depend on the `/auth/me` answer.

**Expected files.** `frontend/app/login/page.tsx`, `frontend/components/LoginForm.tsx`, tests.

**AC.**
- [ ] Given a valid session, when the user opens `/login`, then they land on `/dashboard` and `/login` is not in history (Back does not return to it) -> `app/login/page.test.tsx`
- [ ] Given no session or a stale cookie, when the user opens `/login`, then the form shows and there is no redirect loop -> `app/login/page.test.tsx`
- [ ] While `/auth/me` is pending, neither the form nor "already logged in" text is rendered -> `app/login/page.test.tsx`
- [ ] FE gate green (lint, tsc, vitest, build)

**Notes.** Optional hardening: use the cookie presence only to choose skeleton vs form to avoid a form flash. The redirect decision stays with `/auth/me`.

### CM-TBD-B: Reliable logout and no persisted auth flag
- Type: fix · Spec: SPEC-001 (US-3, AC-001-4) · Audit: M-8 · Priority: P1 · Estimate: S
- Depends on: CM-TBD-A (shares `authStore`; do together)

**Goal.** Logout only clears local state after the server confirmed it, errors are visible, and the server stays the source of truth
for "am I signed in".

**Scope.**
- In scope: `logout()` becomes async; `await POST /logout`; on success clear user, then navigate (the success message is shown on the
  next page, for example via a query flag or a toast that survives navigation); on failure keep state and show an error toast. Remove
  `isAuthenticated` from `persist.partialize` (keep nothing auth-related in localStorage, or only a UI hint that never gates behaviour).
  `StompProvider` connects only after `/auth/me` succeeded. Remove unused `loginWithAccountSelection`. Replace `console.error` per
  `AGENTS.md`.
- Out of scope: server-side revocation of open WebSockets on logout (SPEC-008 non-goal, WS-A02..A04, needs an ADR).

**Expected files.** `frontend/lib/stores/authStore.ts`, `frontend/lib/api/authApi.ts`, `frontend/lib/realtime/StompProvider.tsx`, tests.

**AC.**
- [ ] When `POST /logout` fails with 403, then auth state is kept and an error is shown -> `authStore.test.ts`
- [ ] When `POST /logout` succeeds, then state is cleared and the user lands on `/login` -> `authStore.test.ts`
- [ ] A fresh page load with an expired session does not open a WebSocket before `/auth/me` answers -> `StompProvider.test.tsx`
- [ ] FE gate green

### CM-TBD-C: Login provider handling cleanup
- Type: refactor · Priority: P2 · Estimate: S
- Depends on: CM-063

**Scope.** In: send `prompt=select_account` only for Google; delete dead code; verify the `?error=true` toast on `/login`
(SPEC-001 AC-001-5 has no test yet) and add one.
**AC.** `LoginForm`/`authApi` tests cover both providers and the error toast; FE gate green.

### Already planned elsewhere (do not duplicate)
- AC-008-14, F-4: 401 on `ws-token` stops reconnect and goes to `/login` -> CM-068.
- User menu with Sign out, dashboard auth gate without an "Access Denied" flash, login cleanup (`href="#"`, per-mousemove state) -> CM-063.
  CM-TBD-A and CM-TBD-B should be scheduled right after CM-063 so they do not conflict on `app/login/page.tsx` and `LoginForm.tsx`.

## 5. Endpoint gap analysis

For MVP v0 no endpoint is missing; SPEC-001 and SPEC-006 stories are fully covered.

| Candidate | Verdict | Reason |
|---|---|---|
| `GET /api/v1/users?ids=a,b,c` (batch lookup) | Maybe | `usersStore` calls `getUserById` per id. If sender names or member lists need many ids, that is N+1 requests. Measure real call counts first. |
| `DELETE /api/v1/users/me` | Plan before public launch | The app stores email and avatar. Needs rules for the person's messages and rooms. Not in any spec yet. |
| `PATCH /api/v1/users/me` | No, conflicts with AC-001-2 | Every login overwrites `name` and `avatarUrl` from the provider; an edited name would be lost. Change AC-001-2 first if this is wanted. |
| `/api/v1/auth/status` | No | Removed on purpose (S-1). |
| Session list, "sign out everywhere", server-side WS revocation | No (v1) | SPEC-008 non-goal; needs an ADR. |
| Blocking, friends, provider linking | No | Non-goals in SPEC-001 and SPEC-006. |
| Dedicated CSRF endpoint | No | `CsrfCookieFilter` sets `XSRF-TOKEN`; the frontend calls `/auth/me` before any POST. |

Other search gaps recorded in SPEC-006: no minimum query length (an empty query lists users) and no ranking by match quality.

## 6. Suggested order

1. Re-run `WsTokenServiceTest` and `AuthChannelInterceptorTest` alone and confirm the real counts (section 1).
2. Owner answers section 3 decisions 1 and 2; update SPEC-001 accordingly (owner action, not an agent).
3. CM-063, then CM-TBD-A and CM-TBD-B together, then CM-TBD-C.
4. CM-068 covers F-4 independently.
5. Revisit batch user lookup and account deletion after the v0 smoke test.
