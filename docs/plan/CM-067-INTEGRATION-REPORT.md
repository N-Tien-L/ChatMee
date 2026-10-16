# CM-067 (Release v0): integration report

- Worker: `integrator` · Branch: `release/v0-integration` (from local `develop` d8b5d58) · Date: 2026-10-16
- Nothing pushed; `main` and `develop` refs untouched; no tag.

## 1. Merges (`--no-ff`, in order)
| # | Branch | Branch tip | Merge commit | Conflicts |
|---|---|---|---|---|
| 1 | `feat/CM-084-mobile-account-menu` | b46a2d5 | a4e7898 | none |
| 2 | `fix/CM-086-frontend-readiness` | 077af5c | 3caad00 | none |
| 3 | `feat/CM-066-room-dialogs` | 4384e44 | 331df10 | none |
| 4 | `feat/CM-080-safety-ui` | b78bc66 | e503b08 | none |
| 5 | `feat/CM-079-requests-inbox` | 06a3348 | bb3957d | `ChatInterface.tsx`, `chatRoomsStore.test.ts` (see 2) |
| 6 | `fix/CM-085-backend-readiness` | cb1a4f3 | e66f386 | none |

## 2. Conflict resolution (merge 5)
`frontend/components/chat/ChatInterface.tsx`, per `docs/plan/CM-080-REPORT.md` "Merge awareness":
- Imports: kept `RoomPanel`, `ReportDialog`, `Button` (CM-066/080); dropped the deleted `RoomInfoDialog`/`RoomSettingsDialog`
  and the unused `ParticipantRole`; `MessageType` joins the existing `RoomType` import. `useAuthStore` and `currentUserId`
  are restored because CM-079's `requestUsed` needs them (CM-066 had removed them with the owner check).
- Both `blocked` (CM-080) and `requestUsed` (CM-079) are kept.
- Send guard, `disabled`: `... || requestUsed || blocked`; `inputDisabled={requestUsed || blocked}`.
- `canResend={connected && !requestUsed && !blocked}`.
- `pausedHint`: CM-079's expression unchanged, except that it is `null` while `blocked`, so the `BlockedDmBanner` above the
  composer is the only hint (a "Request sent" hint next to "You blocked X" would be misleading).

`frontend/lib/stores/chatRoomsStore.test.ts`: both sides kept (CM-066/080 `startDirectMessage`/`hideRoom`/`setCounterpartBlocked`
tests and CM-079 `createRoom` toast tests).

CM-079 test that referenced the deleted dialogs: `ChatInterface.request.test.tsx` now mocks `@/components/room/RoomPanel` instead.

New test: `ChatInterface.blocked.test.tsx#render_blockedDmIn%sState_keepsComposerDisabled` (`REQUESTED`, `ACTIVE`): composer and
Send stay disabled, banner shown, no "Request sent" hint, a form submit does not send.

## 3. Follow-up commits (Refs: CM-067)
| Commit | Change |
|---|---|
| e23b9e5 `refactor(rooms): return a settings response record instead of the entity class` | New `dto/response/RoomSettingsResponse` record; `ChatRoomResponse.settings` maps the entity (JSON unchanged). Test: `ResponseContractTest#chatRoomResponse_withSettings_mapsToSettingsRecordWithSameJson`. Completes A-02. |
| 82027e7 `docs(docs): document tempId and welcomeMessage length limits` | `websocket-protocol.md` `/app/chat.sendMessage` row: `tempId` at most 64, longer is `VALIDATION_FAILED`. `data-model.md` `chat_rooms.settings`: `welcomeMessage` at most 500 (the only place room settings fields are documented in `docs/design`). |
| 186d63e `docs(docs): fix stale test citations in SPEC-002, SPEC-003 and SPEC-009` | The 6 fixes from CM-085-REPORT §4, plus AC-009-28 `RoomInfoDialog.test.tsx` -> `RoomPanel.test.tsx`. Citation text only. |
| acf5f1d `docs(docs): mark SPEC-008 AC-008-8, AC-008-9 and AC-008-10 Implemented` | Status lines only; all 24 cited test names verified with grep. |
| cb0fa47 `docs(docs): draft AC-008-16 v0 known-gap amendment (owner approval pending)` | Separate commit. AC-008-16 note + §10 amendment entry: in-order processing deferred to v1 (WS-A14); known gaps: recipient-side decline not broadcast to the recipient's other tabs, no realtime block event to the blocker's other tabs, `/members` has no `joinedAt`/order (successor naming best-effort). |
| 6b92b34 `docs(docs): correct README roadmap, features and security known gaps` | Root README: roadmap drops shipped items (CM-044 cursor history, ownership transfer), links V1_BACKLOG; feature bullets corrected for v0 (invitations instead of direct add, owner leave transfer, DM requests/hide, block/report, live list); security model lists WS revocation gap (WS-A02..A04, A-06) and "presence is visible to every signed-in user (AC-005-4, v1)". `backend/README.md`: `/app/presence` wording (W-3; CM-085 had not changed it). |
| 5af541a `docs(docs): add CHANGELOG with the v0.1.0 entry` | New `CHANGELOG.md`, `0.1.0 - Unreleased`, features summarised from SPEC-001..009. No tag. |

## 4. Spec lines changed
- SPEC-002 AC-002-5 (3 citations), AC-002-7 (1 citation replaced by the 2 AC-009-24 tests).
- SPEC-003 AC-003-1, AC-003-3 (1 citation each).
- SPEC-009 AC-009-28 (`RoomInfoDialog.test.tsx` -> `RoomPanel.test.tsx`).
- SPEC-008 AC-008-8, AC-008-9, AC-008-10: `Test: planned` -> `Implemented` with test names.
- SPEC-008 AC-008-16 (added draft note) and §10 Amendments (new draft entry): commit cb0fa47, owner approval pending.

## 5. Gates on `release/v0-integration`
Run at 5af541a (this report commit adds only this file).
- Backend `./mvnw verify` (Docker Desktop running): BUILD SUCCESS. Surefire: 578 tests, 0 failures, 0 errors, 0 skipped.
  Failsafe (`*IT`): 105 tests, 0 failures, 0 errors, 0 skipped. JaCoCo: "All coverage checks have been met."
- Frontend (`npm ci` first):
  - `npm run lint`: 0 errors, 8 warnings.
  - `npx tsc --noEmit`: clean.
  - `npm test`: 53 files, 354 tests passed.
  - `npm run build`: success (Next.js 16.3.8, routes `/`, `/dashboard`, `/login`, `/profile`).
- No integration breakage beyond the merge-5 conflict; no other code fixes were needed.

## 6. AC status sweep (second task)
There are no `CM-063/064/065/068-REPORT.md` files. The evidence below comes from those tickets' commit messages (e0e0087, cff811d,
d5d60bd, 5528680) and from grepping the real tests. An AC is marked Implemented only when the cited tests exist and assert every
part of it.

New test: the `noNativeDialogs.test.ts` guard now also fails on call/video controls (lucide `Phone`/`Video`/`Camera` icons,
"voice/video/audio call", `aria-label` with call/video) and on "coming soon"/"later update" copy:
`#sources_appAndComponents_containNoCallVideoControlsOrComingSoonCopy`, plus `#deadControlPatterns_sample%#_isDetected` (5 samples,
which check that the patterns really match). `npm test`: 53 files, 360 tests passed. tsc is clean. No backend change, so `./mvnw test` was not rerun.

| AC | Result | Evidence or gap |
|---|---|---|
| AC-008-10 | Implemented (citation extended) | adds `noNativeDialogs.test.ts#sources_appAndComponents_containNoCallVideoControlsOrComingSoonCopy` |
| AC-008-15 | **Implemented** | `StompMessagingIT#sendMessage_twoSessionsOfOneUser_privateErrorReachesOnlySendingSession` (second tab gets nothing), `ChatWebSocketControllerAuthTest#sendMessage_processingFailure_sendsErrorOnlyToPrincipal` and `#sendMessage_saveFailure_sendsPrivateErrorWithoutBroadcast` (session-id header), `UserEventsIT#sendMessage_unopenedRoom_deliversActivityToAllMemberSessionsButNotNonMember` (events reach every session) |
| AC-009-14 | **Implemented** | `RateLimitingServiceTest#checkDailyAction_exactlyAtDailyLimit_allows`, `#checkDailyAction_twentyFirstDmRequest_throwsRateLimitExceededWithRetryAfter`, `DirectMessageRequestServiceTest#checkCanRequest_dailyDmRequestLimitReached_throwsRateLimitExceeded`, `#resolveRequested_sameSenderAgain_doesNotConsumeDailyDmRequestLimit`, `ChatRoomControllerWebMvcTest#createRoom_existingDirectMessage_returns200WithExistingRoom` (no create, so no count), `GlobalExceptionHandlerTest#getRoom_dailyLimitReached_returns429ProblemWithRetryAfter`, `chatRoomsStore.test.ts#createRoom_declineCooldownOrBlock_toastsTheServerReason` |
| AC-008-4 | planned | Covered: `chatRoomsStore.events.test.ts` (`#handleUserEvent_roomAdded_upsertsRoom`, `#handleUserEvent_roomRemovedReason%s_removesRoom`, `#applyActivity_otherUsersMessage_incrementsUnreadAndMovesRoomToTop`, `#applyActivity_openRoomWhileVisible_keepsZeroUnreadAndMarksRead`, `#applyActivity_openRoomWhileTabHidden_incrementsUnreadWithoutMarkingRead`, `#getUnreadTotal_manyRooms_sumsUnreadCounts`), `ChatInterface.ended.test.tsx#userEvent_roomRemoved%s_showsMatchingEndedView`. **Gap:** nothing tests `document.title` (set in `ChatRoomsList.tsx:93`). |
| AC-008-11 | planned | Covered: `MessageList.grouping.test.tsx` (grouping, SYSTEM rows), `MessageList.scroll.test.tsx` (smart scroll, "New messages"), `UserAvatar.test.tsx`. **Gaps:** no guard test for hard-coded `gray-*`/`blue-*` classes, and no test for the 360 px layout. |
| AC-008-13 | planned | Covered: `MessageServiceTest#sendMessage_sameClientMessageIdTwice_storesOnlyOneMessage`, `MessageRepositoryIT#save_concurrentDuplicateClientMessageId_storesExactlyOneRow`, `ResponseContractTest#responseFactories_records_preserveJsonPropertiesAndTimestamps` (`clientMessageId` in the shared history/broadcast DTO), `messageUtils.resync.test.ts#matchResyncedPending_sameClientMessageIdAfterLongDisconnect_confirmsPending`, `#mergeResyncedMessages_lostConfirmation_showsServerCopyOnce`, `useRoomMessage.test.ts#resync_lostEchoMoreThanTheMatchWindowAgo_showsStoredMessageOnce`, `#resend_afterTimedOutSend_reusesClientIdAndStoredCopyConfirmsIt`, `ChatWebSocketControllerTest#sendMessage_broadcastThrowsAfterSave_doesNotSendInternalErrorToSender`. **Gap:** no test asserts that a broadcast failure is *logged*. |
| AC-008-14 | planned | Covered: `stompSession.test.ts` "stops retrying and reports unauthorized when the ws-token is rejected with 401" and both jitter tests. **Gap:** nothing tests that `StompProvider` wires `onUnauthorized` to `/login` (`StompProvider.tsx:44`). |
| AC-008-16 | unchanged | draft known-gap amendment (cb0fa47) |
| AC-009-20 | planned | Covered: `ReportControllerWebMvcTest` (202 for USER/MESSAGE/ROOM, 404 for invisible message or room, repeat 202, note 500/501, `#createReport_withNoteAndMessageContent_logsOnlyIdsAndReason`), `ReportServiceTest` (visibility, `#createReport_duplicateReport_countedOnceWithoutError`, `#createReport_dailyReportLimitReached_throwsRateLimitWithoutSaving` with a mocked limiter), `ReportDialog.test.tsx`. **Gap:** no test asserts the value 10 per day for reports. `RateLimitingServiceTest` builds the service with 10 but tests only the DM boundary, and the value comes from `chatmee.rate-limit.daily.report=10`. |

Each gap is a small test: a `document.title` render test, a palette grep guard plus a 360 px check, a log capture in
`ChatWebSocketControllerTest`, a `StompProvider` unauthorized redirect test, and an 11th-report boundary test in `RateLimitingServiceTest`.

## 7. Open items
- Section 8 closed the five gaps from section 6. The only v0 AC still open is AC-008-16 (draft amendment, owner approval pending),
  plus AC-008-12 (the release sign-off itself).
- AGENTS.md §2 lists `./mvnw spotless:apply`, but Spotless is not configured in `backend/pom.xml` (not added, per instructions).
- `docs/plan/V0-READINESS-A-REPORT.md` is still untracked in the main checkout.
- `npm run lint` reports 8 warnings, 0 errors (e.g. `@next/next/no-location-assign-relative-destination` in `lib/api/apiClient.ts`,
  `lib/api/authApi.ts`); not changed here.
- Still to do in CM-067 (owner): full-stack smoke, secrets rotation, backfills, merge to `main`, tag `v0.1.0`, and approval of the
  AC-008-16 draft.

## 8. Closing the five AC gaps (third task)
Each new test asserts the part that section 6 reported as missing. No production code changed.

| AC | New test | What it asserts | Status |
|---|---|---|---|
| AC-008-4 | `frontend/components/room/ChatRoomsList.title.test.tsx#render_unreadRooms_showsTotalInTitleAndClearsWhenRead`, `#render_noUnread_showsPlainTitle` | `document.title` is `(5) ChatMee` for 2 + 3 unread, drops to `(3) ChatMee` and then `ChatMee` as `markRoomRead` clears each room (the real store, with the API mocked) | Implemented |
| AC-008-11 | `frontend/components/noRawPalette.test.ts#sources_appAndComponents_containNoGrayOrBlueTailwindClasses`, plus `#rawPalettePattern_sample%#_matchesExpectation` (5 samples: variants and opacity match, token classes do not) | no `*-gray-NNN` / `*-blue-NNN` class in `app/` or `components/` (`components/ui` excluded) | Implemented. The 360 px part is covered by the manual smoke checklist ("Mobile width 360 px"), and the AC line says so. No automated test was faked. |
| AC-008-13 | `backend/.../controller/ChatWebSocketControllerTest#sendMessage_broadcastThrowsAfterSave_logsWarningWithIdsOnly` (logback `ListAppender`) | exactly one WARN, containing the message id, the room id and the exception type, and not the message content, the exception text (which holds the content and a token-like string) or the session id; no throwable attached | Implemented |
| AC-008-14 | `frontend/lib/realtime/StompProvider.unauthorized.test.tsx#wsToken401_redirectsToLoginExpiredAndStopsTheSocket`, `#wsTokenNetworkError_doesNotRedirect` | real `stompSession` with a fake STOMP client: a ws-token 401 (axios cause) calls `window.location.replace("/login?reason=expired")`, deactivates the client and fetches the token only once; a network error does not redirect. The auth/me 401 path is the existing `apiClient.test.ts#redirects an expired session to login` (any `/api` 401 -> `/login?reason=expired`). | Implemented |
| AC-009-20 | `backend/.../service/ReportDailyLimitBindingTest#createReport_defaultConfig_allowsTenPerDayAndRejectsTheEleventh`, `#createReport_overriddenLimit_bindsConfiguredValue` | `ApplicationContextRunner` with the real config data (style of `PersistencePropertyBindingTest`): `chatmee.rate-limit.daily.report` resolves to 10, and the real `ReportService` + `RateLimitingService` (Redis counter simulated) store 10 reports and reject the 11th with `RateLimitExceededException`; an override of 3 rejects the 4th | Implemented |

Spec lines changed: SPEC-008 AC-008-4, -11, -13, -14 and SPEC-009 AC-009-20, status and test names only. AC-008-16 is unchanged (draft amendment).

Gates on this commit:
- Backend `./mvnw verify`: BUILD SUCCESS. Surefire 581 tests (was 578), Failsafe 105, all 0 failures/errors/skipped. JaCoCo checks met.
- Frontend: `npm run lint` 0 errors (8 existing warnings), `npx tsc --noEmit` clean, `npm test` 56 files / 370 tests passed, `npm run build` success.
