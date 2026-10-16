# MVP v0 smoke test report (CM-067 checklist)

- Commit under test: `2dfee85` (release/v0-integration), detached HEAD in the main worktree. Backend from source (`spring-boot:run`, profile `local`), frontend `next dev`.
- Method: two Chromium windows driven over CDP (A = Google account "Lâm Nhật Tiên", B = GitHub account "N-Tien-L"). Findings are only recorded, nothing was fixed during the run.
- Date: 2026-10-16. Evidence: screenshots in the scratchpad (not committed).

## Results

| # | Item | Result | Notes |
|---|---|---|---|
| 1 | Sign in, reload, `/login` redirect, sign out | PARTIAL | Both sessions survive reload; `/login` while signed in lands on `/dashboard`; `/auth/me` 200. Sign out: see end of file. |
| 2 | DM request A -> B | PASS (with F-1) | B gets live Inbox badge and request with preview; A input locks after one message. |
| 3 | Accept / second request / decline | PARTIAL | Accept works live for both; a second "New message" to the same user reopens the same DM (no duplicate). Decline NOT TESTED: needs a third account (a declined pair has a 30-day cooldown). |
| 4 | Unread in a room not being viewed | PASS | List moves it to top, preview "Name: text", badge 1, title "(1) ChatMee". |
| 5 | Open clears badge, reload keeps it | PASS | `unreadCount` 0 before and after reload. |
| 6 | Public room, Discover, join | PASS (with F-3) | A sees "N-Tien-L joined". |
| 7 | Private room invite, accept, remove | PASS | Invitation live in B's Inbox; after removal B sees "You are no longer a member". |
| 8 | Promote, owner leaves, auto-transfer | PASS (with F-2) | Confirm text "N-Tien-L will become the owner"; system messages "made N-Tien-L an admin", "left", "N-Tien-L is now the owner"; B `myRole` = OWNER. |
| 9 | Block / unblock | PASS (with F-4) | Blocked DM send: "Cannot message this user" with Resend/Discard; `GET /users?query=` excludes B; after unblock, Resend delivered. |
| 10 | Hide DM | PASS | Leaves B's list only; a new message from A brings it back with unread 1. |
| 11 | Report a message | PASS | `POST /reports` 202, dialog closes, A's view unchanged. |
| 12 | Delete room | PASS | Member sees "This room was deleted" and the room leaves the list. |
| 13 | Network off/on | PASS | Simulated by closing the STOMP socket and blocking reconnects (Playwright `routeWebSocket` + offline). Banner "Reconnecting", message sent meanwhile appears after reconnect. |
| 14 | Mobile 360 px | PASS | List -> conversation -> Back works, no horizontal overflow, the New room dialog fits and its Create button is reachable (the dev-only Next.js badge overlaps the bottom-left). |
| 15 | Failed message: Resend / Discard | PASS (simulated) | Backend not stopped (see Method notes). With SEND frames swallowed the message shows "Not sent" with Resend and Discard; Discard removes it, Resend delivers it once (history count 1). |
| 16 | Socket drops right after SEND | PASS (simulated) | Server saved the message, echo dropped and socket closed: after reconnect the message appears once on screen and once in history; a transient disabled Resend disappears by itself. |
| 17 | Two tabs, rate limit | PASS | 14 rapid sends in tab 1: "Too many messages. Try again in 1 s" only in tab 1, none in tab 2. |
| 18 | Expired session | PASS | JSESSIONID removed plus socket dropped: redirected to `/login?reason=expired` within 1 s. An already-open socket without a drop stays up (documented v1 gap WS-A02..A04); a reload goes to `/login`. |

## Method notes
- Sessions are in-memory in Tomcat, so stopping the backend would have logged both accounts out (OAuth needed again). Items 13, 15 and 16 were therefore simulated in the browser: Playwright `routeWebSocket` closes or blocks the STOMP socket, swallows SEND frames or drops the server echo. The server and database were real.
- Item 3 decline needs a third account; not run.

## Findings
- **F-1 (low)** The sender's pending-DM banner says "Waiting for Direct Message to accept" and the list row is titled "Direct Message" instead of the recipient's name (plan expects "Waiting for B to accept"). After accept the name is correct.
- **F-2 (medium)** After a user is removed from a room and then re-invited to the SAME room, B's open view stays on "You are no longer a member" even after rejoining. The ended state is not cleared when switching to another conversation either: B opened a DM and still saw "You are no longer a member" until a full reload. Repro: A removes B from private room, A re-invites, B accepts, B clicks any other chat.
- **F-3 (low)** The owner's header member count for the public room stayed "1/50" after B joined (B saw 2/50). Also the Discover dialog stays open after a successful join ("No public rooms found").
- **F-4 (low)** "New message" dialog still lists a blocked user under RECENT and shows "Found 1 user" for the blocker's search, although the API correctly returns no results.
- **F-5 (info)** Room-list previews show "No messages yet" for a room that only has SYSTEM messages (joined/left); consistent with the spec, noted for UX.

## Re-smoke after CM-089/090/091 (2026-10-16)
- Commit under test: `6b7bf18` (release/v0-integration with fix/CM-089, CM-090, CM-091 merged). Backend `spring-boot:run` (profile `local`) and `next dev` from that tree; two Chromium windows over CDP (N-Tien-L on GitHub = owner, Lâm Nhật Tiên on Google = member). Nothing fixed during the run.

| Item | Result | Notes |
|---|---|---|
| F-3 member count (public room) | PASS | Owner header went 1/50 -> 2/50 live when the member joined from Discover. |
| F-3 Discover after join | PASS | Dialog closed and the joined room opened (`/dashboard?roomId=...`). |
| F-2 removed then re-invited | PASS | After accepting the new invitation the same room showed the live view; opening a DM and coming back showed no "You are no longer a member". |
| F-4 blocked user in New message | PASS | No RECENT section, search showed "No users found". Unblock restored the DM. |
| Item 1 sign out | PASS | `/login?signedOut=true`, stays on /login after reload, the other session was unaffected. |
| F-1 pending DM name | PASS (round 2) | Third account "LN Tien": list row and banner showed "Waiting for N-Tien-L to accept". |
| Item 3 decline | PASS (round 2) | Recipient declined from Inbox; sender saw "Your message request to N-Tien-L was declined" and a retry gave "Cannot message this user" (cooldown). |

### New findings
- **F-6 (low-medium)** Owner header member count is stale when the room is not open while someone joins (private room: invitation accepted while the owner was in the invite dialog). Server had 2 participants, header showed 1/50 until the next membership event. Cause: the room is only refetched on a SYSTEM message received while open; opening a room does not refresh it. Suggested: refetch the room when it is opened (CM-090 AC-1 follow-up).
- **F-7 (low)** The room info panel stays stale while open (it showed 1 / 50 and one member after the header already said 2/50).

### Round 2 (CM-092, commit after `6b7bf18`)
- F-6 PASS: with the room closed, a third member joined; opening the room showed 3/50.
- F-7 PASS: with the info panel open, a member left; panel and header both went 3 -> 2 without reload.
- Third account was driven in a third Chromium window (CDP :9224).

### Round 3: `develop` at `d370462` (all of the above plus CM-088)
- Gates on `develop` (main checkout, after `./mvnw clean verify`): backend 582 unit + 105 IT green; frontend lint 0 errors, tsc clean, 382 tests, build compiled. (A first `verify` failed with "Unresolved compilation problems" from stale IDE-compiled classes in `backend/target`; `clean` fixed it, source was fine.)
- Browser smoke on the merged build (backend from the release worktree, frontend from `develop`): Discover search and join closes the dialog and opens the room; owner header 3/50; blocked user absent from New message and search; unblock works; a room message reached the other member.
- Not included: CM-093 (message time reveal, draft, branch `feat/CM-093-message-time-reveal`).
