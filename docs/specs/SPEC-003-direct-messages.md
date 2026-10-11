# SPEC-003: Direct messages (DM)
- Status: Draft
- Owner: @N-Tien-L · Created: 2026-10-09 · Related: ADR-0005, design/data-model.md

## 1. Goal
Two users chat privately in a room that has exactly those two members, shows the other person's name, and exists only once per pair.

## 2. Non-goals
- Group DMs, hiding a DM (phase 3).

## 3. User stories
- US-1: As a user, I start a DM with another user and see their name as the room title.
- US-2: As a user, starting a DM with someone I already talk to opens the existing conversation.

## 4. Acceptance criteria
- AC-003-1: Creating a DM with a valid `participantId` other than oneself creates a room with exactly 2 members and no name; the UI shows the other person's name. -> Implemented. Test: `ChatRoomServiceTest#createRoom_directRoom_createsSuccessfully`, `ChatRoomControllerValidationTest#createRoom_directMessageWithParticipantAndNoName_returnsCreated`, `ChatRoomControllerValidationTest#createRoom_directMessageWithoutParticipant_returnsBadRequest`
- AC-003-2: Only one DM per pair of users: creating it again returns the existing room (200). -> Implemented (CM-049): sorted-pair `memberKey` with a unique sparse index; an existing DM returns 200 and a concurrent duplicate returns the winner. Test: `ChatRoomServiceTest#findExistingDirectRoom_activePair_returnsThatRoomWithOrderIndependentKey`, `ChatRoomServiceTest#createRoom_concurrentDuplicateDirectRoom_returnsTheRoomThatWon`, `RoomMembershipIT#save_secondActiveDirectRoomForSamePair_isRejectedByUniqueMemberKey`
- AC-003-3: A DM cannot be joined, extended with members, given another `maxMembers`, or left. -> Implemented (CM-041): join (403), add participant (403), `maxMembers` change (400) and leave (403) are rejected by the direct room policy. Test: `ChatRoomControllerAuthorizationTest#joinRoom_directMessageRoom_returnsForbidden`, `ChatRoomControllerAuthorizationTest#addParticipant_directRoom_returnsForbiddenAction`, `ChatRoomServiceTest#leaveChatRoomById_directMessage_throwsException`, `ChatRoomServiceTest#updateChatRoomById_directMessageInvalidUpdate_throwsException`
- AC-003-4: The room list response includes the other member (`counterpart{id, name, avatarUrl}`), so the client does not make N extra requests. -> Implemented (CM-049): `counterpart{id, name, avatarUrl}` is filled for all rooms in one batched query. Test: `ChatRoomServiceTest#toResponses_directRoom_showsOtherMemberAsCounterpart`

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| The other user does not exist | Not found | 404 |
| DM with oneself | Rejected | 400 (CM-041) |

## 6. Security & Authorization
Only the two members can read or send; the same membership checks as group rooms apply (SPEC-002, SPEC-004).

## 7. Non-functional
The pair lookup must be a single indexed query (`memberKey` unique, CM-049).

## 8. Related APIs / Protocols
docs/design/data-model.md, OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Existing duplicate DMs in production: merge or keep the newest when the unique `memberKey` is introduced (CM-049)?
