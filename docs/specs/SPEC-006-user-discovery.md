# SPEC-006: User search
- Status: Approved (2026-10-12; amended by SPEC-009 AC-009-17)
- Owner: @N-Tien-L · Created: 2026-10-09 · Related: design/error-handling.md, SPEC-009

## 1. Goal
Users find other people by name to start a DM or add them to a room, without exposing anyone's email.

## 2. Non-goals
- Search by email, friend lists. (Blocking is in SPEC-009; blocked users are excluded from search both ways, AC-009-17, CM-073.)

## 3. User stories
- US-1: As a user, I type part of a name and pick a person from the results.

## 4. Acceptance criteria
Implemented by CM-047 as `GET /api/v1/users?query=&page=&size=` (the draft named it `/users/search?q=`).
- AC-006-1: Search returns `UserSummary{id, name, avatarUrl}` pages without email; page size is capped. -> Implemented (size default 20, max 50; an empty query lists users). The draft's minimum query length of 2 characters is not enforced. Test: `UserApiControllerTest#searchUsers_authenticated_returnsNoEmail`, `UserServiceTest#searchUsers_matchingUsers_mapsToSummaryWithoutEmail`, `UserServiceTest#searchUsers_oversizedOrInvalidPaging_clampsPageAndSize`
- AC-006-2: Results exclude the caller and the search is rate limited. -> Implemented (exclusion; REST limit of 100 requests/min per user). Results are not ranked by match quality. Test: `UserServiceTest#searchUsers_anyQuery_excludesCaller`, `UserRepositoryIT#findByNameContainingIgnoreCaseAndIdNot_caseInsensitive_excludesCaller`
- AC-006-3: There is no lookup by `provider/providerId`. -> Implemented. Test: `UserApiControllerTest#providerEndpoint_returns404`
- AC-006-4: Regex characters in the query match literally (no regex injection). -> Implemented. Test: `UserRepositoryIT#findByNameContainingIgnoreCaseAndIdNot_regexWildcard_matchesLiterally`, `UserRepositoryIT#findByNameContainingIgnoreCaseAndIdNot_unbalancedParenthesis_matchesLiterally`

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| Unknown user id on `GET /api/v1/users/{id}` | Not found | 404 (`UserApiControllerTest#getUserById_notFound_returns404`) |
| Unauthenticated | Rejected | 401 ProblemDetail (`UserApiControllerTest#searchUsers_unauthenticated_returns401`) |

## 6. Security & Authorization
Any authenticated user can search. Only the caller's own profile (`/api/v1/auth/me`) contains an email.

## 7. Non-functional
The frontend debounces search input by 300 ms (`lib/stores/usersStore.test.ts`).

## 8. Related APIs / Protocols
docs/design/error-handling.md, OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Resolved 2026-10-12 (D-21): minimum query length and ranking by match quality are v1. A batch lookup `GET /users?ids=` is added only if measured N+1 calls require it.
