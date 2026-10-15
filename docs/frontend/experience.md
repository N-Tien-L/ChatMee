# Experience: journeys, routes and states (CM-084)

Updated: 2026-10-14 · Phase 2 · Source of behaviour: `develop` 41bbb29 code + specs cited per journey.
No user testing has happened; the owner walkthrough at milestone C is review, not user testing.

## Product structure

| Area | Route | Surface | Theme (D-7) |
|---|---|---|---|
| Landing | `/` (today: redirect to `/login`) | public, persuasive | dark |
| Sign in | `/login`, `/login?error=true` | public | dark |
| Workspace | `/dashboard`, `/dashboard?roomId=<id>` | working | light |
| Profile | `/profile` | working | light |

Entry points: landing CTA -> `/login`; OAuth callback -> `/dashboard` (AC-001-1); any 401 -> `/login` (apiClient, ws-token);
`proxy.ts` redirects cookie-less `/dashboard` and `/profile` to `/login`. Deep link `/dashboard?roomId=` opens a room directly.
Below 768 px the workspace is one pane: list is home, a room is a full screen with Back (CM-063).

## Priority journeys

```
Journey: J1 Sign in with OAuth              Priority: 1
Actor / role: visitor                       Goal: reach the workspace
Trigger / entry point: landing CTA, direct /login, redirect after 401
Steps: 1. Open /login (session check skeleton) 2. Choose GitHub (first) or Google 3. Provider consent 4. Callback -> /dashboard
Success outcome: workspace shell with the user's avatar in the header; room list loads
Conditions: no session. A signed-in user opening /login is replaced to /dashboard (AC-001-9)
Failure cases -> recovery: provider error -> /login?error=true + toast "Login failed. Please try again." (AC-001-5);
  stale cookie -> form shown, no loop (SPEC-001 §5); backend down -> form shown (check fails as guest) [gap G1]
Data and capabilities: /oauth2/authorization/{provider}, /api/v1/auth/me -> real
Acceptance criteria: AC-001-1, -5, -9
```

```
Journey: J2 Browse and join rooms           Priority: 2
Actor / role: signed-in user                Goal: find a public room and enter it
Trigger / entry point: "Discover rooms" button in the room list header
Steps: 1. Open Discover dialog 2. Type a query (300 ms debounce) 3. See paged PUBLIC rooms not joined 4. Join 5. Room appears in the list and opens
Success outcome: the room is in the list, the conversation opens, the history shows "<name> joined" (AC-008-7)
Conditions: PUBLIC rooms only; PRIVATE/DM never listed (AC-002-3)
Failure cases -> recovery: ROOM_FULL -> inline "This room is full" in the dialog; ALREADY_PARTICIPANT -> open the room [verify];
  search error -> inline error with Retry; empty -> "No public rooms match" guidance
Data and capabilities: GET /rooms, GET /rooms/discover, POST /rooms/{id}/join, ROOM_ADDED event -> real
Acceptance criteria: AC-002-2, -3, -4; AC-008-2, -4
```

```
Journey: J3 Send and receive in realtime     Priority: 3
Actor / role: room member (two users, two browsers) Goal: converse live
Trigger / entry point: open a room from the list or a deep link
Steps: 1. History loads (newest 50) 2. Type (typing indicator for others) 3. Send: bubble shows "sending" 4. Echo -> "sent"
  5. Other member sees it live; their list moves the room to the top with a badge if not open (AC-008-4) 6. Scroll up loads older
Success outcome: both sides see one copy of each message, in order, grouped by sender; unread badge clears on open
Conditions: member of an active room (AC-004-2)
Failure cases -> recovery: error or 10 s timeout -> "failed" with Resend / Discard (AC-004-5); RATE_LIMITED -> failed in the
  sending tab only (AC-008-15); history error -> inline error + Retry; removed/deleted while viewing -> "You are no longer a member" /
  "This room was deleted", input gone (SPEC-008 §5)
Data and capabilities: STOMP /app/chat.sendMessage, /topic/rooms/{id}, /topic/rooms/{id}/typing, /user/queue/errors,
  /user/queue/events, GET /rooms/{id}/messages?before= -> real
Acceptance criteria: AC-004-3..8; AC-008-4, -11, -13
```

```
Journey: J4 Reconnect and expired-session recovery   Priority: 4 (highest risk)
Actor / role: signed-in user                Goal: never lose messages silently; never stay stuck
Trigger: network drop, backend restart, tab sleep, session expiry
Steps (drop): 1. Banner "Connection lost. Reconnecting…" 2. Capped backoff with jitter 3. Reconnect: resubscribe, refetch room list,
  presence snapshot, newest page merged by id 4. Banner clears
Steps (expiry): 1. Any API 401 or ws-token 401 2. Client stops reconnecting 3. Full navigation to /login
Success outcome: missed messages appear once; after expiry the user is on /login and can sign in again
Failure cases -> recovery: send while offline -> input disabled (connected=false) or message fails with Resend;
  expired session -> /login without explanation [gap G2]
Data and capabilities: POST /auth/ws-token (401 path), STOMP heartbeat 10 s -> real
Acceptance criteria: AC-004-7; AC-008-14; SPEC-001 §5 rows "Session expired mid-use" and "ws-token answers 401"
```

Secondary journeys (reuse patterns, restyle only): create room, DMs and user search, room info/settings, leave/delete, profile,
sign out. Their feature work stays in CM-066, CM-079, CM-080 (D-4).

## Screen and state inventory

✓ = exists on `develop`; **gap** = missing or weak; n/a with reason.

| Screen | Journeys | Loading | Empty | Populated | Error | Denied | Expired | Offline / reconnecting | Other |
|---|---|---|---|---|---|---|---|---|---|
| Landing `/` | J1 entry | n/a: static | n/a | new (D-6) | n/a: static | n/a: public | n/a | n/a | reduced motion |
| Login `/login` | J1, J4 | ✓ session skeleton | n/a | ✓ form | ✓ `?error=true` toast | n/a: public | **gap G2** no "session ended" note | **gap G1** backend down looks like guest | redirect when signed in ✓ |
| Workspace shell | all | ✓ gate skeleton | n/a | ✓ | n/a | redirect ✓ | ✓ 401 -> /login | ✓ ConnectionBanner (raw palette) | 360 px single pane ✓ |
| Room list | J2, J3 | ✓ | ✓ | ✓ order, preview, badge | ✓ + Retry | n/a | via shell | refetch on reconnect ✓ | title count ✓ (AC-008-4) |
| Discover dialog | J2 | ✓ | ✓ | ✓ paged | ✓ search; join ROOM_FULL ✓ | n/a: PUBLIC only | via shell | not reachable: dialog uses REST only | debounce 300 ms |
| Conversation | J3, J4 | ✓ | ✓ "No messages yet. Say hello!" | ✓ grouping, SYSTEM centred | ✓ history + Retry; older error | ✓ removed / deleted views | via shell | input disabled when not connected; **gap G3** no inline hint why | long content (5000 chars) wraps [verify]; typing ✓; new-messages button ✓ |
| Message bubble | J3 | sending ✓ | n/a | sent ✓ | failed + Resend/Discard ✓ | n/a | n/a | Resend disabled offline ✓ | rate limited -> failed ✓ |

## Gaps found (proposed handling)

| Id | Gap | Proposal | Label |
|---|---|---|---|
| G1 | Backend unreachable on /login looks like "not signed in"; sign-in then fails at the provider redirect | Show a quiet "Can't reach ChatMee right now" note when `/auth/me` fails with a network error (not 401). Store change in `authStore` (distinguish 401 from network) | proposed |
| G2 | After session expiry the user lands on /login with no explanation | Redirect to `/login?reason=expired` from the 401 paths; login shows "Your session ended. Sign in again." | proposed |
| G3 | Offline: send button is disabled with no reason given | Composer hint "Reconnecting… messages send when you're back" while not connected | proposed |
| G4 | ~257 raw palette classes in app components (AC-008-11 not met on `develop`) | Token migration as part of the visual system | evidence-backed (grep 2026-10-14) |

G1 to G3 change small client logic inside the priority journeys; they are presented at milestone A for an owner decision, not built yet.

## Interaction rules (existing, kept)

- Submit: Enter sends, Shift+Enter new line; empty or whitespace never sends; the input clears at once (optimistic).
- Retry: history Retry refetches the newest page; Resend reuses the client message id (AC-008-13).
- Back (mobile): returns to the list; browser Back follows the `roomId` query.
- Refresh: session re-checked by `/auth/me`; room list refetched; open room reloads history.
- Concurrent: a message from another tab of the same user arrives as a normal echo; errors only in the sending tab.

## Draft content (new or changed copy)

- Landing: one-line promise, a short "how it works" for engineers, one primary action "Sign in with GitHub". No invented metrics.
- Login G2: "Your session ended. Sign in again to continue."
- Login G1: "Can't reach ChatMee right now. Check your connection and try again."
- Composer G3: "Reconnecting… you can send when the connection is back."
- Discover empty: "No public rooms match \"{query}\". Try another name or create a room."
