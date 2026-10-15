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

## 6. Open items
- **SPEC-008 ACs not marked** (no evidence in the CM-066/079/080/085/086 reports): AC-008-4 (CM-064), AC-008-11 (CM-063/065),
  AC-008-13/14/15 (CM-068), AC-008-16 (see draft amendment). Their tickets' reports should supply the test names.
- **SPEC-009 ACs not marked**: AC-009-14 (CM-078) and AC-009-20 (CM-074) still say `planned`. Backend tests appear to exist
  (`RateLimitingServiceTest#checkDailyAction_twentyFirstDmRequest_throwsRateLimitExceededWithRetryAfter`,
  `ReportControllerWebMvcTest`, `ReportServiceTest`) and CM-079/CM-080 add the client side, but these were not in the evidence set.
- AC-008-10: the tests cover native dialogs, `href="#"` and removed fake settings; absence of call/video buttons and "coming soon"
  text was checked by a source grep during CM-067 (no matches), not by a committed test.
- AGENTS.md §2 lists `./mvnw spotless:apply`, but Spotless is not configured in `backend/pom.xml` (not added, per instructions).
- `docs/plan/V0-READINESS-A-REPORT.md` is still untracked in the main checkout.
- `npm run lint` reports 8 warnings, 0 errors (e.g. `@next/next/no-location-assign-relative-destination` in `lib/api/apiClient.ts`,
  `lib/api/authApi.ts`); not changed here.
- Still to do in CM-067 (owner): full-stack smoke, secrets rotation, backfills, merge to `main`, tag `v0.1.0`, and approval of the
  AC-008-16 draft.
