# CM-091: Show the recipient's name on a pending DM request
- Type: fix
- Spec: SPEC-009 (DM request flow) · Source: V0-SMOKE-REPORT F-1
- Priority: P2 · Estimate: S

## Goal
The sender's pending-DM banner and list row must show the recipient's name ("Waiting for B to accept"), not "Direct Message".

## Scope
- In scope: find whether the REQUESTED room payload for the sender carries `counterpart`; fix at the right layer.
- Out of scope: Inbox UI, accept/decline flow.

## Expected Files to Touch
- `frontend/lib/stores/chatRoomsStore.ts` (fallback at ~447/470) and/or the backend room mapper that fills `counterpart` (CM-049), plus tests

## Acceptance Criteria
- [x] AC-1 (root cause: backend, REQUESTED DM has only the sender row; counterpart now derived from the pair key). Test: `ChatRoomServiceTest#toResponses_requestedDirectRoom_showsRecipientFromPairKeyAsCounterpart`. Original:: Given A sends a first message request to B, Then A's list row and banner show B's name immediately. Test: store test, plus a backend test if the payload is the cause.
- [ ] `./mvnw verify` and frontend lint/tsc/test/build are green

## Technical Notes / Hints
- Step 1: inspect the sender's `ROOM_UPDATED`/create response for a REQUESTED DM. If `counterpart` is missing, the fix is backend; if present, the frontend ignores it.
- Do not edit approved specs to match the code.

## Follow-ups (New findings, DO NOT do in this ticket)
