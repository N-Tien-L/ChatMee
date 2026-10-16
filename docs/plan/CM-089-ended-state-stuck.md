# CM-089: Clear the "no longer a member" view after re-joining or switching chats
- Type: fix
- Spec: SPEC-008 (AC-008-4), SPEC-009 (AC-009-12/13) · Source: V0-SMOKE-REPORT F-2
- Priority: P1 · Estimate: S
- Branch: `fix/CM-089-ended-state-stuck` (branch from `release/v0-integration`)

## Goal
After a user is removed from a private room and re-invited to the SAME room, the open view must leave the ended state once they rejoin. Opening any other chat must never show a stale ended message.

## Scope
- In scope: ended-state handling in `ChatInterface` and the `endedRooms` slice of `chatRoomsStore`; regression tests.
- Out of scope: backend, ended-copy wording, other room-lifecycle behavior.

## Expected Files to Touch
- `frontend/components/chat/ChatInterface.tsx`
- `frontend/lib/stores/chatRoomsStore.ts`
- `frontend/components/chat/ChatInterface.ended.test.tsx`

## Acceptance Criteria
- [x] AC-1: Given B was removed from room R and sees the ended view, When B is re-invited, accepts, and R is back in the store, Then R renders the live room view. Test: `ChatInterface.ended.test.tsx`.
- [x] AC-2 (not reproducible at component level, guarded by test; dashboard already keys ChatInterface by roomId): Given B has an ended view for R, When B selects another chat (DM or room), Then no ended text is shown for that chat, without reload. Test: `ChatInterface.ended.test.tsx`.
- [x] Failing reproduction test written BEFORE the fix.
- [ ] `./mvnw verify` and frontend lint/tsc/test/build are green

## Technical Notes / Hints
- Suspect: `ended` state (`ChatInterface.tsx:52-70`) is set when a room disappears but never cleared when `roomExists` becomes true again; `endedRooms[roomId]` is not cleared on rejoin.
- The "other chat still shows ended" half is NOT explained by reading the code (`endedReason` is already keyed by `roomId`). Reproduce first (check whether the view remounts on room change, and what `endedRooms` holds).

## Follow-ups (New findings, DO NOT do in this ticket)
