# SPEC-002: Group chat rooms (PUBLIC / PRIVATE)
- Status: Draft
- Owner: @N-Tien-L · Created: 2026-10-09 · Related: ADR-0005, design/data-model.md, design/error-handling.md

## 1. Goal
Users create group rooms, see their rooms, discover and join public rooms, invite people into private rooms, and the owner manages or deletes the room. Membership stays consistent under concurrent requests.

## 2. Non-goals
- Ownership transfer, bans, moderation tools (phase 3).

## 3. User stories
- US-1: As a user, I create a room and become its owner.
- US-2: As a user, I see only the rooms I belong to.
- US-3: As a user, I discover public rooms and join one.
- US-4: As an owner/admin, I add people to a private room.
- US-5: As an owner, I edit or delete my room; as a member, I leave it.

## 4. Acceptance criteria
Routes follow the target from the audit and are implemented under `/api/v1/rooms/...` (CM-042).
- AC-002-1: Creating a room: `name` 1-100 characters (Unicode letters, digits, spaces, `._-`), `description` <= 500, `maxMembers` 2-1000; the creator becomes `OWNER`. Invalid input returns 400 with field errors. -> Implemented (CM-007, CM-025). Test: `ChatRoomControllerValidationTest#createRoom_nameOf101Characters_returnsBadRequest`, `ChatRoomControllerValidationTest#createRoom_nameWithForbiddenCharacters_returnsBadRequest`, `ChatRoomControllerValidationTest#createRoom_oneMaxUser_returnsBadRequest`, `ChatRoomControllerWebMvcTest#createRoom_validPublicRoom_returns201WithRoom`
- AC-002-2: `GET /rooms` returns only active rooms the caller is a member of. -> Implemented. Test: `ChatRoomControllerWebMvcTest#listRooms_authenticated_returnsCallerRooms`, `ChatRoomServiceTest#getList_returnsUserRooms`
- AC-002-3: `GET /rooms/discover?query=` returns paged PUBLIC rooms the caller has not joined. -> Not implemented. Planned: CM-048
- AC-002-4: Joining a PUBLIC room with free seats succeeds; a full room returns 409 `ROOM_FULL`; an existing member gets 409 `ALREADY_PARTICIPANT`; PRIVATE and DM rooms return 403. -> Implemented (status 200 instead of 204). Test: `ChatRoomControllerWebMvcTest#joinRoom_fullRoom_returns409Problem`, `ChatRoomControllerWebMvcTest#joinRoom_alreadyMember_returns409Problem`, `ChatRoomControllerAuthorizationTest#joinRoom_privateRoom_returnsForbidden`, `ChatRoomControllerAuthorizationTest#joinRoom_directMessageRoom_returnsForbidden`
- AC-002-5: Only OWNER/ADMIN add members; only OWNER grants ADMIN; nobody grants OWNER. -> Implemented (CM-008). Test: `ChatRoomControllerAuthorizationTest#addParticipant_adminAssigningAdmin_returnsForbidden`, `ChatRoomControllerAuthorizationTest#addParticipant_ownerAssigningAdmin_returnsOk`, `ChatRoomControllerAuthorizationTest#addParticipant_nonParticipant_returnsForbidden`
- AC-002-6: Only the OWNER edits or deletes the room. Deletion is soft, broadcasts a room-deleted event, and members lose access. -> Implemented (CM-028). Test: `ChatRoomControllerWebMvcTest#deleteRoom_nonCreator_returns403Problem`, `ChatRoomServiceTest#deleteChatRoomById_creator_softDeletesCleansUpAndBroadcasts`, `RoomMembershipIT#softDelete_activeRoom_hidesRoomAndBlocksJoins`. Partially: open STOMP subscriptions are not revoked server-side. Planned: CM-058
- AC-002-7: The OWNER cannot leave (delete or transfer first). A member who leaves loses subscribe and history access immediately. -> Partially implemented: leave rules and REST/WS checks hold; existing subscriptions are not revoked server-side. Test: `ChatRoomServiceTest#leaveChatRoomById_creator_throwsException`, `ChatRoomControllerWebMvcTest#leaveRoom_member_returns200`. Planned: CM-058
- AC-002-8: Membership changes are atomic: under concurrency the member count never exceeds `maxMembers` and no duplicate rows exist. -> Implemented (CM-028, ADR-0005). Test: `RoomMembershipIT#addParticipant_twentyConcurrentJoinsWithCapacityTen_exactlyTenSucceed`, `RoomMembershipIT#addParticipant_sameUserJoiningConcurrently_storesOneMembership`, `ParticipantRepositoryIT#save_duplicateRoomAndUser_rejectedByUniqueIndex`

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| New `maxMembers` below the current member count | Rejected | 400 (`RoomMembershipIT#updateEditableFields_capacityBelowMembers_isRejectedAndKeepsCounter`) |
| Unknown `roomId` | Not found | 404 |
| Caller is not a member | Not found, to avoid revealing the room | 404 (`ChatRoomControllerWebMvcTest#getRoom_nonMember_returns404Problem`) |
| Join racing a delete | Membership in a deleted room grants nothing | 403 (CM-041 review: active-room guard) |

## 6. Security & Authorization
Room access is checked server-side for REST and STOMP; the caller comes from the session principal. Room-type rules (join, add, update, leave) live in the room type policies (CM-041).

## 7. Non-functional
REST requests are rate limited per user (100/min) and per address for anonymous calls (20/min).

## 8. Related APIs / Protocols
docs/design/data-model.md, docs/design/error-handling.md, docs/design/websocket-protocol.md, OpenAPI at `/v3/api-docs` (dev/local profiles only).

## 9. Open questions
- Join currently returns 200 with a body; switch to 204 in CM-042?
- Ownership transfer is not designed yet.
