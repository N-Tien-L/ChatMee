# CM-092: Keep member counts fresh when a room was closed or its info panel is open
- Type: fix
- Spec: SPEC-002 · Source: V0-SMOKE-REPORT re-smoke F-6, F-7 (follow-up of CM-090 AC-1)
- Priority: P2 · Estimate: S
- Branch: `fix/CM-092-stale-member-counts`

## Goal
The owner's header count and the room info panel must show the true member count even when someone joined while the room was not open, or while the panel is open.

## Scope
- In scope: refresh the room when it is opened; reload the panel's member list when the store's participant count changes while it is open.
- Out of scope: backend events, protocol changes.

## Expected Files to Touch
- `frontend/hooks/useRoomMessage.ts`, `frontend/components/room/RoomPanel.tsx` and their tests

## Acceptance Criteria
- [x] AC-1 (F-6): Given a member joined while the owner had the room closed, When the owner opens it, Then the header shows the server count. Test: `useRoomMessage.test.ts#open_roomWithStaleParticipants_refreshesRoomFromServer`.
- [x] AC-2 (F-7): Given the info panel is open, When the store's participant count changes, Then the member list reloads. Test: `RoomPanel.test.tsx#render_storeParticipantsGrowWhileOpen_reloadsMemberList`.
- [x] Frontend lint/tsc/test/build green

## Follow-ups (New findings, DO NOT do in this ticket)
