# ChatMee v0 production-readiness review — Reviewer B

> Historical readiness review. Findings below describe the reviewed baseline, before the
> integration fixes. For subsequent fixes and checks, see
> [CM-067 integration](CM-067-INTEGRATION-REPORT.md) and [v0 smoke](V0-SMOKE-REPORT.md).
> Production owner actions still require separate confirmation.

Review date: 2026-10-15 (Asia/Bangkok). Scope: frontend, UX, browser compatibility and performance.
Reviewed checkout: `C:\Users\Tien\Workspace\Personal\ChatMee`, branch `feat/CM-084-mobile-account-menu`, HEAD `b46a2d5eb30fa0d58f18279f8f72af516c898686`.
Tracked files were clean at the beginning. Existing untracked files were preserved; excluded directories and secret files were not inspected. This report is the only intentional repository file change. No source fixes, dependency changes, commits, pushes, deployments or other worktree operations were performed. Builds regenerated local build artifacts.

## 1. Verdict: NO-GO

The frontend does not yet satisfy the complete v0 contract: safety actions, member/role management and parts of the DM request experience are missing or incorrect.
Fake creation settings and native browser alerts remain, and the new constellation degradation mechanism has a reproduced logic defect.
Lint, TypeScript and all 238 tests pass, but the required Turbopack production build fails locally; a diagnostic webpack build passing does not clear that gate.
Browser fixtures demonstrate several working client flows, but the real two-account OAuth/backend smoke test and Firefox/WebKit compatibility remain unverified.
This verdict concerns the complete v0 release, including SPEC-009, rather than only the narrower CM-084 visual-delivery scope.

### Evidence boundaries

- Read: root `AGENTS.md`, `CLAUDE.md`, `frontend/AGENTS.md`, `frontend/CLAUDE.md`, SPEC-008, SPEC-009, V1_BACKLOG, UI_UX_AUDIT, MVP_V0_PLAN, relevant data-model/error-handling/WebSocket design sections, CM-084 and frontend decision records. `docs/design/ui-workflow.md`, referenced by CM-084, is absent.
- Framework checks used the installed Next 16.3.8 documentation for Proxy, fonts and rewrites. `proxy.ts` is supported; its cookie-presence check is documented as a UX guard, with actual authentication checked through `/auth/me`.
- No listener appeared at ports 3000, 3001, 8080, 27017 or 6379 in the initial `netstat` check. This establishes the absence of the usual local endpoints, not the absence of every possible Docker configuration. No backend or OAuth stack was started.
- Browser traffic was restricted to localhost/127.0.0.1. Authenticated UI used the existing browser-test fixture convention (`frontend/tests/browser/account-menu.js`), intercepted API responses and an intercepted STOMP peer. These are synthetic client checks, not authentication, persistence, authorization or full-stack evidence. No real credentials or production endpoints were used.
- The browser review used the diagnostic **production webpack build**, served by Next's production server. No performance conclusion uses dev mode. The required `npm run build` artifact could not be produced.
- Evidence below is exact output, DOM measurements or reproduction steps. No screenshot files were added. One 390 px software-rendered hero image was inspected in memory.

## 2. Commands run and results

Commands were run in `frontend/` unless indicated otherwise. Some gate checks were repeated while capturing complete output; the totals below describe the final completed run, not summed duplicate runs.

| Command/check | Result | Key evidence |
| --- | --- | --- |
| `git branch --show-current`, `git rev-parse HEAD`, `git status --short --untracked-files=no` (root) | Pass | Requested branch and SHA above; tracked tree clean before report creation. |
| `netstat -ano -p tcp` filtered for usual stack ports (root) | Stack unavailable | No listening entries for 3000/3001/8080/27017/6379 before review server startup. `Get-NetTCPConnection` was unavailable because CIM access was denied; netstat supplied the evidence. |
| `Test-Path frontend/node_modules` (root) | Present | `True`; `npm ci` unnecessary and not run. |
| `npm run lint` | Pass, warnings | Exit 0; **0 errors, 11 warnings**. Includes hook dependency/compiler warnings and internal-navigation warnings. |
| `npx tsc --noEmit` | Pass | Exit 0, no diagnostics. No stale `.next` type failure was observed; nothing deleted. |
| `npm test` | Pass | **40 files, 238 tests passed**, duration 31.52 s. Expected network-error test logging and Radix missing-description warnings remain in output. |
| `npm run build` | **Fail** | Next 16.3.8 Turbopack fails processing `app/globals.css`: `creating new process` / `node process exited before we could connect to it with exit code: 0`. |
| Same build outside sandbox | **Fail** | Same error. Panic log: `C:\Users\Tien\AppData\Local\Temp\next-panic-7567a78d8a26b1328adab57ac5784b57.log`. |
| Bundled Node 24.19.0, `node_modules/next/dist/bin/next build --turbopack` | **Fail** | Same error. Normal shell Node was 23.6.0; changing to the existing bundled runtime did not resolve it. No Node installation changed. |
| `node node_modules/next/dist/bin/next build --webpack` | Diagnostic pass | Compiled in 22.8 s, TypeScript finished, 7/7 static pages generated, exit 0. Routes `/`, `/dashboard`, `/login`, `/profile`, `/_not-found`; Proxy present. **Does not replace the scripted Turbopack gate.** |
| `npm start -- --hostname 127.0.0.1` | Invocation failed | npm parsed the argument incorrectly and Next treated `127.0.0.1` as a directory. No application defect inferred. |
| `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000` | Diagnostic server pass | Production server ready in 169 ms, loopback only. Equivalent Next server entry point to the `start` script. |
| TypeScript AST scan of non-test app/components/hooks/lib, excluding `components/ui` | Pass | `explicitAny: []`, `consoleLog: []`, `directApiPages: []`. An additional raw `gray-*`/`blue-*` palette search returned no matches in reviewed app components. |
| Playwright API/STOMP fixture checks | Mixed | Passing flows and reproduced findings are detailed below. External HTTP traffic blocked; WebSockets intercepted. |
| In-memory execution of unmodified constellation effect | **Fail degradation; pass tested cleanup branches** | At 60 ms/frame, 240 draws after 240 frames, no quality-triggered resize/freeze; offscreen/hidden/reduced-motion/cleanup results below. |

The build failure is a **release-gate blocker**, with local toolchain/root cause unassigned. It is not evidence that a Vercel build will necessarily fail. Reproduce the exact scripted build in the documented Node 22 release environment/CI and retain a passing result before deployment; do not silently substitute webpack or edit configuration as part of this review.

## 3. Findings, ranked by severity

### B-01 — High — v0 safety actions are absent; a DM still offers Delete

- **Area / locations:** `frontend/components/room/ChatRoomListItem.tsx:204`, `:218`; `frontend/components/room/RoomInfoDialog.tsx:276`; `frontend/app/profile/page.tsx:24`; `frontend/lib/api/userApi.ts:1`; `frontend/lib/api/chatRoomApi.ts:1`; `frontend/lib/types/dto/chat.dto.ts:56`.
- **Expected:** SPEC-008 AC-008-9 and SPEC-009 AC-009-15..22 require hide/block/report on DMs, an unblock path, and read-only presentation for the blocker. A DM must not offer Delete. MVP_V0_PLAN CM-080 specifies the frontend controls.
- **Actual / evidence:** The DM row excludes Leave using `!isDirect`, but renders Delete for any `isOwner`, including the DM requester. In a fixture with `roomType=DIRECT_MESSAGE`, `myRole=OWNER`, clicking `Actions for Person 2` exposed **one Delete button**. Source contains no implemented hide, block/unblock or report API methods/flows in the reviewed resource clients and profile. The room DTO does not model `blocked`; the composer does not use it. The DM info panel has no safety actions.
- **Impact:** Users cannot stop unwanted contact or hide/report through this frontend; the offered Delete operation contradicts the DM contract and will be rejected by the specified backend. This does not claim that server block enforcement is absent.
- **Suggested fix:** Complete CM-080 against the existing APIs, remove DM Delete, add hide/report/block/unblock and the blocked-DM presentation. Retain server-side enforcement.

### B-02 — High — member management is incomplete and Room info still uses the historical creator as owner

- **Area / locations:** `frontend/components/room/RoomInfoDialog.tsx:42`, `:83`, `:93`, `:133`, `:262`, `:276`; `frontend/components/room/RoomSettingsDialog.tsx:117`, `:379`; `frontend/components/chat/ChatInterface.tsx:131`.
- **Expected:** SPEC-008 AC-008-8/9 and SPEC-009 AC-009-23..25 require actions based on participant roles, member removal/promotion/demotion and messaging from the member list. SPEC-008 §5 also requires the owner-leave confirmation to name the next owner.
- **Actual / evidence:** Room info loads only the first **10 of 12** fixture members using **10 individual `/users/{id}` requests**, even though the chat typing-name hook independently calls the batched `/members` endpoint. Rows omit Message/remove/role actions. Settings says **“Removing members and changing roles come in a later update.”** In a consistent ownership-transfer fixture (`createdBy=user-1`, caller `myRole=OWNER`, caller's member role OWNER, user-1 MEMBER), Room info displayed **Person 1 — Owner** and **zero Room settings buttons** for the actual owner. It tests `createdBy`, not `myRole`, for settings and the owner badge. Leave confirmations do not name a successor.
- **Impact:** The required ownership/membership lifecycle cannot be managed through the UI; after automatic transfer, Room info misidentifies the owner and hides their settings entry point. Some other components correctly use `myRole`, making behavior inconsistent.
- **Suggested fix:** Complete the remaining CM-066 frontend work using the batched member-role response; show all members through an appropriate list, implement authorized actions and a successor-aware owner-leave confirmation. Use participant role consistently.

### B-03 — Medium — Create room exposes settings that v0 explicitly removes

- **Area / locations:** `frontend/components/room/CreateRoomModal.tsx:54`, `:101`, `:299`, `:309`.
- **Expected:** SPEC-008 §2 removes `welcomeMessage`, `allowFileSharing`, `allowGuestUsers`, `moderationRequired` from the v0 UI because they have no behavior; AC-008-10 prohibits fake settings.
- **Actual / evidence:** Open New room → More options. The browser displays **Welcome message**, **Allow file sharing**, **Require moderation**. Creation sends them in `settings` (plus `allowGuestUsers: false`). A search of frontend sources finds `welcomeMessage` only in the settings type and this modal's state/form/request; **no conversation renderer consumes it**.
- **Suggested fix:** Remove these controls and their frontend form state/request values for v0. Keep only supported options; do not amend the Approved spec to legitimize inactive controls.

### B-04 — Medium — a pending DM remains sendable after its one allowed message

- **Area / locations:** `frontend/components/chat/ChatHeader.tsx:103`; `frontend/components/chat/ChatInterface.tsx:190`, `:316`; `frontend/components/chat/MessageInput.tsx:52`.
- **Expected:** SPEC-009 AC-009-10, SPEC-008 AC-008-8 and MVP_V0_PLAN CM-079 require a pending-request banner and disabled sending after the requester's one message.
- **Actual / evidence:** Fixture DM: `state=REQUESTED`, `lastMessage.senderId` equals the caller, and history includes an existing message. The header displayed **Waiting for them to accept**, but entering “Second request message” yielded `sendEnabled: true`. The send condition checks connection/nonempty text, not request state or the already-used allowance. The backend rejection remains the eventual enforcement path.
- **Suggested fix:** Derive the request allowance from current room/message state, disable sending once consumed, explain why, and retain generic server-error handling for races. Test re-enabling after `ROOM_UPDATED` activates the DM.

### B-05 — Medium — Room Settings still invokes native alert and prompt dialogs

- **Area / locations:** `frontend/components/room/RoomSettingsDialog.tsx:47`, `:150`, `:169`, `:182`.
- **Expected:** SPEC-008 AC-008-10 requires application confirmation dialogs and toasts, without browser `alert()` or fake “coming later” controls.
- **Actual / evidence:** Edit an owned room name in Room Settings → Save Changes against a successful intercepted PUT. Playwright captured a native **alert**, message **“Room updated successfully”**. `showToast` actually calls `alert()` for success/error. Deletion asks for `window.prompt()` and reports via the same helper.
- **Suggested fix:** Use the existing toast and confirmation-dialog primitives, with keyboard/focus behavior appropriate to both desktop Dialog and mobile Sheet.

### B-06 — Medium — constellation adaptive degradation cannot trigger

- **Area / locations:** `frontend/components/fx/constellation-grid.tsx:269`, `:288`, especially `:290`.
- **Expected:** Commit `dc96634` promises coarser mesh followed by a frozen frame when the frame interval remains slow.
- **Actual / evidence:** Every `loop()` calls `watchFrameTime(now)` then `schedule()`. `schedule()` resets `prevFrameAt=0`; the next watcher therefore always chooses the fallback **16 ms** rather than `now - prevFrameAt`. Its EMA never reaches the 28 ms threshold.
- **Reproduction:** Transpile the unchanged component with installed TypeScript, capture its effect with stubbed React hooks, supply a 1280×800 canvas/context and deterministic rAF callbacks advancing 60 ms, execute 240 callbacks. Output at frames **45/90/180/240**: draws **45/90/180/240**, resize count **2/2/2/2** (initial observer + explicit resize), pending rAF **1/1/1/1**. No quality change or freeze occurs. All 121,464 sampled arc coordinates were finite. This is an isolated deterministic effect probe, not a browser smoothness assertion.
- **Impact:** The fallback intended for slow/software rendering does not protect struggling devices. A short actual software-rendered 6× run had median mesh-frame interval 30.1 ms and p95 56.2 ms, so slow frames are observable on this machine.
- **Suggested fix:** Preserve the previous frame timestamp during continuous scheduling; reset it only when actually resuming. Add a meaningful test covering sustained slow frames and transitions to both degraded states.

### B-07 — Medium — ROOM_REMOVED discards the reason, producing the wrong terminal state

- **Area / locations:** `frontend/lib/stores/chatRoomsStore.ts:161`; `frontend/components/chat/ChatInterface.tsx:37`, `:48`.
- **Expected:** SPEC-008 AC-008-4 and §5 distinguish removal from deletion; CM-079 also requires feedback for DECLINED/EXPIRED requests.
- **Actual / evidence:** Inject `/user/queue/events` with `{type:"ROOM_REMOVED", payload:{roomId:"room-one", reason:"DELETED"}}` while that room is open, without a separate room-topic deletion frame. The list removes the room and releases its topic subscriptions; the main view displays **“You are no longer a member”**. The store ignores `reason`, and the disappearing-room effect hardcodes `removed`. DECLINED/EXPIRED also have no dedicated feedback path.
- **Suggested fix:** Preserve and consume the terminal reason from the user event. Do not depend on the separate room-topic deletion frame arriving first; that order is not guaranteed by the client contract.

### B-08 — Low — the account menu lacks arrow-key focus navigation

- **Area / locations:** `frontend/components/common/UserMenu.tsx:30`, `:59`, `:69`.
- **Expected:** A control exposing `aria-haspopup="menu"` / `role="menu"` should support the corresponding menu keyboard interaction, including moving focus into and among its items.
- **Actual / evidence:** Focus Account menu → Enter → ArrowDown. `document.activeElement` remains the trigger (`aria-label="Account menu"`, no menuitem role). The only custom key handler is Escape. Tab access and Escape/focus return work; this is not a claim that keyboard users cannot reach any menu item.
- **Suggested fix:** Implement menu focus/arrow/Home/End behavior using a suitable existing primitive or complete the custom behavior. Preserve the mobile stacking fix.

## 4. Known items 1–5: confirmed or refuted

| Item | Result | Evidence and limits |
| --- | --- | --- |
| 1. Fake welcome/file/moderation settings; welcome rendering | **Confirmed** | B-03. Real modal controls and POST payload verified with fixtures; no `welcomeMessage` conversation renderer found. |
| 2. Rotating hero word clipped in teal box | **Not reproduced in tested Chromium samples** | Settled letter boxes fit their clipping containers at 360/390/768/1280 px. A 390×800 touch, `--disable-gpu` image inspected in memory showed the full **study group** word, including descenders, inside its teal pill. It is a solid teal pill by design. This does not refute clipping on Firefox/WebKit or at every animation frame. |
| 3. Constellation changes in `dc96634` | **Partially confirmed; degradation refuted** | Fixed 1/60 s integration, 3-substep cap, 12 stroke buckets and hover-none drift exist. B-06 disproves adaptive degradation. Deterministic source-effect probe leaves zero queued rAFs when offscreen/hidden/reduced-motion, and zero tracked listeners/media listeners after cleanup. Actual touch software run reports `hoverNone:true`; changing reduced motion adds **0 mesh frames over 600 ms** after settling. No long-duration heap study or real hidden-tab/offscreen browser observation was completed. Jitter-free behavior is not certified by finite coordinates or a still image. |
| 4. `b46a2d5` create result and idempotent add | **Confirmed for exercised cases; no regression reproduced** | Existing tests cover successful room return/null and repeated add. Actual fixture UI: public creation opens `?roomId=created-2`; private creation enters Invite people, Skip opens `?roomId=created-1`; selecting a person posts `/rooms/created-3/invitations`. Injecting ROOM_ADDED **100 ms before** the create HTTP response leaves **one** Race fixture row and opens `?roomId=race-created`. New-message test verifies a DM request without client-built `roomName`; real two-account delivery remains unverified. |
| 5. Header Inbox / sidebar Discover / z-index | **Confirmed, with a keyboard caveat** | Header is `z-20`. Account menu fits and all sampled item centers receive pointer hits at all four widths; Dark selection and Escape focus return work. Settled Inbox/Discover dialogs are on screen and hit-testable; badge/accessible trigger reads **Inbox, 1 waiting**. Dynamic badge is intentionally hidden from accessibility separately because the button label includes the count. B-08 concerns account-menu arrows; screen-reader speech output and live announcement quality were not tested. |

## 5. Browser and device matrix actually tested

All heights 800 px unless specified. Fixture state includes a long room name, a 5,000-character unbroken message, a pending DM and an invitation. Dialog positions below were sampled **after** opening animations settled; intermediate entrance transforms are not counted as layout defects.

| Browser/runtime | Width | Actual coverage / result |
| --- | --- | --- |
| Chromium 155.0.8059.79, Playwright MCP | 360 | Landing DOM/word bounds; authenticated fixture sidebar/chat; 5,000-character message without document overflow; account item hit tests; Inbox/Discover; mobile Back. Inbox settled x=0, width=360; Discover x=0, width=360. |
| Same | 390 | Same viewport/menu/dialog checks; Dark selection; profile renders; Ctrl+K opens combobox and choosing a room navigates. Subpixel dialog width 390.4 at x=0 was observed; no material horizontal scrolling established. |
| Same | 768 | Two-pane fixture workspace, header/menu hit tests, Inbox (x=124,width=520), Discover (x=160,width=448); landing bounds. |
| Same | 1280 | Desktop fixture walkthrough and CPU 4×/6× diagnostics; Inbox (x=380,width=520), Discover (x=416,width=448); landing bounds. |
| Chromium 156.0.8078.4, installed headless shell, `--disable-gpu`, touch/mobile emulation | 390 | Landing software-rendering sample; hover-none true; 1×/4×/6× CPU timing and live reduced-motion switch. Hero **study group** visually readable. This was a short sample, not sustained mobile hardware testing. |
| Same installed Chromium, separate initial matrix attempt | 360 | Landing loaded, font status loaded, document width 360. Later fixture dialog assertion timed out with an incomplete response fixture; not counted as a product defect or as a completed second-browser matrix. |
| Firefox, installed `firefox-1497` | None | Launch in sandbox exited 3221225506. Outside sandbox it launched but `browser.newContext` failed with `Browser.setDefaultViewport` protocol error: supplied `viewport.isMobile` is absent from that executable's protocol schema. No app page tested. No downloads performed. |
| WebKit 26.5, installed `webkit-2227` | None | Browser process launched; context setup with the installed automation library did not complete, including an outside-sandbox attempt. The bounded run was interrupted. No app page tested; not a Safari pass. |

Additional actual checks: at **360×450**, the composer remained in view (y=393.6,height=36). This simulates a shorter viewport, **not an iOS/Android keyboard**. Header touch targets sampled: Inbox 36×36, Account 32×32. These measurements are not a full touch-target/accessibility certification. A transferred-owner fixture with a 90-character unbroken room name kept the mobile info container's scroll/client width equal (345 px); text readability/ellipsis was not exhaustively assessed.

### Functional coverage and spec traceability

| Contract / flow | Evidence / status |
| --- | --- |
| SPEC-008 AC-008-1..3: events, list summaries, read-marker consumption | Store/provider source and passing tests; fixture event/HTTP shapes exercised. Server delivery/query/read-marker persistence not verified. |
| AC-008-4: live rows, unread/title, ended view | Fixture ROOM_ACTIVITY creates preview **Unread fixture**, title changes to **(4) ChatMee**; selected-room mark-read requests observed; tests cover hidden-tab increments. **Partial**, terminal-reason failure B-07. |
| AC-008-5..7: members, removal, SYSTEM messages | Member endpoint consumed for typing names; grouping/SYSTEM-rendering tests pass. **Partial**, management/member-list failure B-02; server side out of area. |
| AC-008-8: creation opens room/DM | Public/private/race fixture checks pass as above; DM creation-request test passes. **Partial**, member-row Message action absent and request allowance B-02/B-04. |
| AC-008-9: role and DM actions | **Fail**, B-01/B-02. |
| AC-008-10: no fake/dead controls/native alerts | **Fail**, B-02/B-03/B-05. No call/video controls, placeholder href="#", or console.log found in reviewed production sources. |
| AC-008-11: tokens, avatars, grouping, scrolling, 360 px | No raw gray/blue palette matches in reviewed app components; initials and real-avatar component present; grouping/scroll-preservation tests pass; fixture layouts and message log checked at all four widths. **Partial verification**: real avatar network/failure variations, full contrast audit, assistive technology and physical devices not completed. |
| AC-008-12: release | **Not met/verified**. Required scripted build fails, frontend findings open, real smoke missing; develop/main/tag/secrets/backfills belong to release owners. |
| AC-008-13: resend, lost-confirmation merge | Passing hook/reducer/session tests include stable client ID and resync merge. Fixture SEND gets one **Sent** accessibility marker after an echo. Server persistence/idempotency not verified. |
| AC-008-14: expired-token stop/redirect, jitter | Session unit tests pass. On a connected fixture, reject the next ws-token with 401, make auth/me return 401, close the intercepted socket: final URL **/login?reason=expired**, copy **“Your session ended. Sign in again.”** Competing redirect produced a Playwright navigation-aborted event, but final URL/copy were independently checked. Actual expiry against Spring is unverified. |
| AC-008-15/16: error audience, inbound ordering | Primarily backend/out of area. Client session/error tests pass; no two-tab real-server verification. Design explicitly documents inbound ordering as unresolved; do not infer completion. |
| SPEC-009 invitations / requests (AC-009-1..14) | Picker submits invitation to the created private room; Inbox invitation/badge renders; store tests pass. Recipient accept/decline, first-message preview, expiry/cooldown and real reconnect recovery not verified end to end. Requester disabled-input behavior fails B-04. |
| SPEC-009 safety (AC-009-15..22) | Frontend failure B-01; server behavior not assessed. |
| SPEC-009 roles/ownership (AC-009-23..25) | Frontend failure B-02; automatic server transfer not assessed. |
| SPEC-009 deleted users / limits (AC-009-28/29) | Deleted-user rendering tests pass. Actual daily rate-limit responses/retry UI not walked through. |

Typing fixture delivered **“Person 2 is typing...”** and presence frames were consumed. Opening a DM and returning through mobile navigation did not create another socket in the same mounted workspace. Cumulative socket counts across full-page navigations are not concurrent-connection counts or leak evidence. Profile and quick-switch navigation were exercised. Loading/error/empty/retry/failed-message states have passing unit/component tests; no claim that every such state was visually walked through on a real stack.

### Shipped features outside the original non-goals

Landing and workspace dark mode are present although SPEC-008 §2 and V1_BACKLOG still defer them. This is **not an unexplained implementation scope finding**: CM-084 records the owner's landing exception, and `docs/frontend/decisions.md` D-15 explicitly authorizes the persisted System/Light/Dark choice. D-16 authorizes Inbox/invites and the two-step create flow, while explicitly leaving member/role/safety features to their other tickets. Those narrower ticket exclusions do not remove them from the complete v0 release criteria. No evidence was found of shipped message editing/deleting, attachments, reactions, search, group DMs, push notifications or room mute. Owner-approved scope/spec documentation needs reconciliation by its owner; this review does not edit Approved specs.

## 6. Performance and graceful degradation

These are single-run localhost diagnostics, not field percentiles, load tests, mobile-device results or release benchmarks. Browser cache/network conditions were not standardized or throttled. The diagnostic compiler differs from the required build. LCP is the last observed entry in the short sample; the CLS column is the observed sum of eligible layout shifts, **not a complete web-vitals session-window calculation**. Zero means none observed in that window.

| Build / sample | CPU | Observed LCP | Layout-shift sum | Other evidence |
| --- | --- | --- | --- | --- |
| webpack production, Chromium 155, 1280 px, about 4.5 s | 4× | 392 ms | 0.06663 | About 387,184 bytes reported by resource transfer-size entries; local sample only. |
| Same | 6× | 524 ms | 0 | Same reported transfer total. |
| webpack production, Chromium 156 `--disable-gpu`, touch 390 px, about 4 s | 1× | 136 ms | 0 | Mesh frame interval median 16.6 ms, p95 17.7 ms; 231 draws. |
| Same | 4× | 148 ms | 0 | Mesh median 17.3 ms, p95 21.7 ms; 215 draws. |
| Same | 6× | 292 ms | 0 | Mesh median 30.1 ms, p95 56.2 ms; 109 draws; mesh backing size stayed 390×800. |

For the software samples, the canvas instrumentation counted only the landing mesh (`opacity-80`), not all canvases. A separate earlier desktop sample counted all canvas clear calls and is deliberately not reported as mesh FPS. `--disable-gpu` is launch-argument evidence; no GPU driver/renderer audit was performed.

**INP:** No representative field INP was measured. In the fixture dashboard at 390 px, opening the account menu, changing Light theme, Escape, opening Inbox and Escape yielded maximum Event Timing durations of **168 ms at 4×** and **296 ms at 6×**. These are debug interaction candidates from five scripted interactions, not a complete INP estimator or a production percentile. The 296 ms sample warrants further profiling; it is not attributed exclusively to the mesh.

Largest implementation costs/effects to profile (not a measured per-component ranking): full-viewport constellation springs/links/dots/radar drawing; login OGL LightRays; full-screen radial glows/backdrop blur; landing spotlight/star-border canvases and Lenis rAF; rotating glyph/layout animation, beams/marquee and demo timers; workspace row layout springs, delivery animations, typing and Inbox ping. Check one effect at a time before assigning causality.

Reduced motion: global MotionConfig is present; CSS effects have reduce guards, rotating text disables automatic rotation, the mesh draws static output. Actual software test added **0 mesh frames in 600 ms** after switching to reduce. The deterministic source-effect probe recorded zero pending mesh rAFs after offscreen/hidden/reduced-motion transitions and zero tracked listeners after cleanup. That probe verifies the effect's tested branches, not every browser observer behavior or whole-app memory retention. No general leak-free or jitter-free certification is made.

## 7. Not verified / out of area

- Real sign-in with Google/GitHub, server session reload/logout/CSRF, and actual expiry: no running backend/OAuth stack or permitted test-account setup. No secrets were read to enable one. The local production configuration disables development rewrites and normally relies on Vercel's rewrites, so a real `next start` walkthrough also needs an approved localhost proxy arrangement; this review did not add one.
- Real two-account public join, private invitation acceptance/decline/revoke, DM acceptance/reply/decline/expiry, membership changes, block/report/hide, database confirmation and rate limits. UI fixtures do not prove these contracts.
- Actual lost network/echo and reconnect catch-up, hidden/background-tab unread behavior and session-scoped errors across tabs. Unit tests and synthetic frames cover portions only.
- Firefox and WebKit pages, physical iOS Safari/Android, safe-area insets, browser chrome changes and real on-screen keyboards. Installed executable/protocol mismatch is an environment limitation, not a product compatibility finding.
- Long-duration heap/listener profiling across repeated client route changes; real offscreen/hidden-tab mesh observation; software-renderer identification; GPU/low-end hardware testing; all animation frames for headline clipping.
- Full contrast audit, NVDA/VoiceOver speech output, every avatar failure, every loading/error state in every browser and complete touch-target audit. Radix missing-description warnings in room-info/settings tests deserve a later accessibility pass.
- Backend/security internals, backend `./mvnw verify`, production secrets/backfills, single-instance deployment, Vercel Node setting, deploy/rollback, merge/tag/CHANGELOG and production smoke are **out of Reviewer B's area**. The unresolved inbound-order design entry should be reconciled by Reviewer A/release owner with AC-008-16; it is not newly diagnosed here.
- `frontend/tests/browser/account-menu.js` was already untracked at review start. Equivalent checks were exercised, but the tracked test suite alone does not guarantee it will be included in a release/CI checkout.

## 8. Follow-ups (separate from release blockers above)

1. **Pin and reproduce the frontend release toolchain** — run the exact npm gate under documented Node 22 in CI; diagnose the local Turbopack child-process failure without substituting a different release build silently.
2. **Finish CM-066 / CM-079 / CM-080 acceptance evidence** — implement the open v0 frontend behaviors identified in B-01..B-05, then execute the existing two-account smoke checklist.
3. **Add controlled constellation degradation coverage** — cover sustained slow frames, pause/resume, frozen-resize and live reduced-motion transitions after fixing B-06.
4. **Make terminal-room states reason-aware** — cover DELETED/REMOVED/DECLINED/EXPIRED user events before/without a room-topic frame.
5. **Provision a repeatable three-engine browser harness** — use matching installed browser/library versions, contract-shaped fixtures, stable post-animation sampling and both light/dark screenshots; keep full-stack checks separate.
6. **Profile interaction latency on low-end hardware** — investigate the 296 ms 6× interaction sample and large public effects with component-level attribution and realistic network conditions.
7. **Complete keyboard/accessibility review** — account-menu focus navigation, room-dialog descriptions, screen-reader announcements, contrast, safe areas and real keyboard behavior.
8. **Reconcile release documents with recorded owner decisions** — landing/theme exceptions, stale CM-084 status/context text and missing `ui-workflow.md` reference; only the authorized owner changes Approved specs.

No fixes were applied. A passing webpack diagnostic and passing unit tests do not close the outstanding functional findings or establish production readiness.
