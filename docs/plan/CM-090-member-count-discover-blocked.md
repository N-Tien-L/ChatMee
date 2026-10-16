# CM-090: Live member count, Discover after join, blocked users in New message
- Type: fix
- Spec: SPEC-002, SPEC-006, SPEC-009 · Source: V0-SMOKE-REPORT F-3, F-4
- Priority: P2 · Estimate: S
- Depends on: CM-088 merged (touches `NewMessageDialog.tsx`, `DiscoverRoomsDialog.tsx`)

## Goal
Keep the owner's header member count correct after someone joins, fix the Discover dialog after a successful join, and stop offering blocked users in the New message dialog.

## Scope
- In scope: the three UI fixes below with tests.
- Out of scope: API contracts, search debounce/skeleton behavior (CM-088).

## Expected Files to Touch
- `frontend/components/chat/ChatInterface.tsx` / member-update handling in the store or room hook
- `frontend/components/room/DiscoverRoomsDialog.tsx`
- `frontend/components/room/NewMessageDialog.tsx`, `frontend/components/user/UserSearchList.tsx`
- matching `*.test.tsx`

## Acceptance Criteria
- [x] AC-1: Given the owner views a public room showing 1/50, When B joins, Then the header shows 2/50 without reload. Test: store/hook or `ChatInterface` test.
- [x] AC-2: Given a successful join from Discover, Then the dialog does not remain open on a stale "No public rooms found" state (owner decided 2026-10-16: close the dialog and open the joined room).
- [x] AC-3: Given A blocked B, Then B is not in RECENT and a search never reports "Found N user" for results the API excluded. Test: `UserSearchList.test.tsx` / `NewMessageDialog` test.
- [ ] `./mvnw verify` and frontend lint/tsc/test/build are green

## Technical Notes / Hints
- Header count is `currentRoom.participants.length` (`ChatInterface.tsx:151`); check whether a "joined" room-topic event updates `participants`.
- Reproduce each item with a failing test first.

## Follow-ups (New findings, DO NOT do in this ticket)
