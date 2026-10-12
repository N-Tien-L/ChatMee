# SPEC-009: Membership by consent, DM requests, blocking and reporting (v0)
- Status: Approved (2026-10-12; v0 scope reduced by decisions D-01..D-06 in docs/plan/MVP_V0_PLAN.md)
- Owner: @N-Tien-L · Created: 2026-10-12 · Related: ADR-0006, SPEC-002, SPEC-003, SPEC-006, SPEC-007, SPEC-008, design/data-model.md, design/websocket-protocol.md

## 1. Goal
Nobody joins a private room or a direct conversation without consenting, a user can stop unwanted contact, a DM can be hidden per user, and a room never gets stuck without an owner. Without this, any admin can add anyone, a stranger can open a DM and deliver a message at once, and a DM can only be deleted by its creator, for both people.

## 2. Non-goals (v1+, see docs/plan/V1_BACKLOG.md)
- Join requests for PRIVATE rooms and invite links (AC-009-6..8, D-02). In v0 a PRIVATE room is entered only by invitation.
- Rejoin cooldown after removal from a PUBLIC room (AC-009-26) and room mute (AC-009-27) (D-03).
- Moderation console, ban lists, reviewing reports, any action taken on a report.
- Manual ownership transfer (v0 only transfers automatically when the owner leaves).
- Privacy settings "who can message me", searchable-profile toggle.
- Mentions, group DMs, account deletion and data export.

## 3. Amendments to other specs (in effect, written into those specs)
- **SPEC-002 US-4 / AC-002-5**: direct add (`POST /rooms/{roomId}/members`) is removed. Members enter a PRIVATE room only through an accepted invitation (AC-009-1..3). Role rules move to AC-009-23.
- **SPEC-002 AC-002-6 / AC-002-7**: "the OWNER" means the participant whose role is `OWNER`, not `createdBy`. The owner may leave: the role moves automatically (AC-009-24).
- **SPEC-003 AC-003-1**: a DM is created in state `REQUESTED` until the recipient accepts (AC-009-9..13).
- **SPEC-003 AC-003-3**: a DM cannot be deleted by a member. It can be hidden per user (AC-009-21), and DELETE on a DM returns 403 (AC-009-22).
- **SPEC-006**: blocked users are excluded from search (AC-009-17).
- **SPEC-007**: daily action buckets (AC-009-29).
- **SPEC-008**: `ROOM_ADDED` is also sent on invitation accept and DM request accept; "add member" actions become "invite"; the owner may leave (§2 non-goal narrowed to manual transfer). SPEC-008 carries these changes in its own text.

## 4. User stories
- US-1: As an owner or admin, I invite a specific person into a private room, and they decide whether to join.
- US-3: As a user, I message someone new; they see a request and decide whether to accept or decline.
- US-4: As a user, I block someone so they cannot reach me, and I can undo it.
- US-5: As a user, I report a person, a message or a room, and I get no visible side effect on the other person.
- US-6: As a DM member, I can hide a conversation from my list without affecting the other person.
- US-7: As an owner, I can promote or demote admins, and I can leave the room without leaving it ownerless.
- (US-2 join requests, US-8 rejoin cooldown, US-9 mute: v1.)

## 5. Acceptance criteria

### Invitations (PRIVATE rooms only) — CM-070
- AC-009-1: OWNER or ADMIN invites an existing user by `userId` with `POST /api/v1/rooms/{roomId}/invitations`. It creates a `membership_requests` row (`kind=INVITE`, `status=PENDING`, `expiresAt` = now + 7 days) and sends `INVITATION_RECEIVED` to the invitee. Inviting a member returns 409 `ALREADY_PARTICIPANT`; inviting while a PENDING invitation exists returns 409 `DUPLICATE_RESOURCE`; a full room returns 409 `ROOM_FULL`. A PUBLIC room returns 400 `INVALID_ARGUMENT` (public rooms are joined through Discover). Non-members of the room get 404; MEMBERs get 403. -> Implemented. Test: InvitationServiceTest#invite_memberCaller_throwsForbiddenWithoutInsert, InvitationControllerWebMvcTest#invite_publicRoom_returns400Problem
- AC-009-2: `POST /api/v1/invitations/{id}/accept` is allowed only for the invitee. The transition `PENDING -> ACCEPTED` is one conditional `findAndModify` (status PENDING and `expiresAt > now`), then the seat is reserved and the member row created as MEMBER, as in ADR-0005. If the seat reservation fails (room full or deleted), the invitation is set back to PENDING (compensation) and the call returns 409 `ROOM_FULL` or 404. Not the invitee: 404. Not PENDING or expired: 409 `INVITATION_NOT_PENDING`. Accepting twice cannot add two rows. On success the invitee gets `ROOM_ADDED` and a SYSTEM message "X joined" is posted (SPEC-008 AC-008-7). -> Implemented. Test: InvitationServiceTest#accept_fullRoom_reopensInvitationAndThrowsRoomFull, InvitationIT#accept_twentyConcurrentAcceptsOfOneInvitation_createOneMembership
- AC-009-3: `POST /api/v1/invitations/{id}/decline` (invitee) sets `DECLINED`. `DELETE /api/v1/invitations/{id}` (inviter, OWNER or ADMIN of the room) sets `REVOKED`. A revoked or declined invitation cannot be accepted. `GET /api/v1/invitations` lists the caller's PENDING, unexpired invitations with `{id, room{id, name, memberCount}, inviter{id, name, avatarUrl}, createdAt, expiresAt}`. `GET /api/v1/rooms/{roomId}/invitations` lists the room's PENDING invitations for OWNER/ADMIN. -> Implemented. Test: InvitationServiceTest#revoke_inviter_setsRevokedAndNotifiesBoth, InvitationIT#decline_pendingInvitation_storesDeclinedAndBlocksAccept
- AC-009-4: If a block exists between invitee and inviter (either direction), the invitation is rejected with 403 "Cannot invite this user" (AC-009-18), and accepting an invitation whose inviter is blocked returns the same 403. -> Implemented. Test: InvitationServiceTest#invite_blockEitherWay_throwsCannotInviteWithoutInsertOrEvent, InvitationServiceTest#accept_inviterBlockedEitherWay_throwsSameCannotInviteWithoutDecision
- AC-009-5: `POST /api/v1/rooms/{roomId}/members` (direct add) is removed. The frontend call is replaced by invitations in CM-066 in the same release. -> Implemented. Test: ChatRoomControllerWebMvcTest#addParticipant_directAddRemoved_returns405WithoutAddingMember

### Join requests — deferred to v1 (D-02)
- AC-009-6..8: not in v0. Kept in V1_BACKLOG with the invite-link question. The `JOIN_REQUEST` kind and `REJECTED` status stay reserved in the data model.

### DM requests — CM-072
- AC-009-9: `POST /api/v1/rooms` with `roomType=DIRECT_MESSAGE` creates the room in state `REQUESTED`, with only the sender's participant row and `memberKey` set. The response is 201 with `state: REQUESTED`. A second request by the same sender for the same pair returns the existing room with 200 (as AC-003-2), whatever its state. If the caller is the pending recipient (B creates a DM with A while A's request to B is pending), the request is accepted as in AC-009-12 and the ACTIVE room is returned with 200. While a decline cooldown exists for the pair, creation returns 403 "Cannot message this user" (same response as a block). -> Implemented. Test: DirectMessageRequestServiceTest#resolveRequested_sameSenderAgain_returnsTheRequestedRoomWithoutDeciding, DirectMessageRequestServiceTest#resolveRequested_recipientCreatesSamePair_acceptsAndReturnsActiveRoom, DirectMessageRequestServiceTest#checkCanRequest_declineCooldownForPair_throwsCannotMessageThisUser, DmRequestIT#createRoom_newPair_storesRequestedRoomWithSenderOnlyAndPendingRequest
- AC-009-10: While `REQUESTED`, the sender may send at most one message (`REQUEST_MESSAGE_LIMIT=1`). A second message returns STOMP error `DM_REQUEST_PENDING` on `/user/queue/errors`. The message is stored normally and is the request preview. -> Implemented. Test: MessageServiceTest#sendMessage_senderSecondMessageInRequestedRoom_throwsDmRequestPendingWithoutSaving, DmRequestIT#sendMessage_senderSendsConcurrentlyWhileRequested_storesExactlyOneRequestMessage, StompMessagingIT#sendMessage_requestedDm_secondSenderMessageGetsDmRequestPendingAndRecipientReplyActivates
- AC-009-11: The recipient receives `DM_REQUEST_RECEIVED` on `/user/queue/events` and sees pending requests with `GET /api/v1/dm-requests` (`{roomId, sender{id, name, avatarUrl}, preview, createdAt, expiresAt}`, newest first). Requests from users the recipient blocked, or who blocked the recipient, are not listed. `GET /rooms` of the sender includes the REQUESTED room with `state: REQUESTED`; the recipient's `GET /rooms` does not. -> Implemented. Test: ChatRoomServiceTest#getList_requestedDm_includedForSenderWithStateAndExcludedForRecipient, DirectMessageRequestServiceTest#listPending_recipient_mapsSenderAndPreviewAndExpiresPastRows, DirectMessageRequestServiceTest#open_newRequestedRoom_storesPendingRequestForFourteenDaysAndNotifiesRecipient, DirectMessageRequestServiceTest#listPending_requestFromUserBlockedEitherWay_isHidden, DirectMessageRequestServiceTest#previewChanged_blockEitherWay_sendsNoDmRequestReceived
- AC-009-12: The request becomes `ACTIVE` when the recipient either calls `POST /api/v1/rooms/{roomId}/dm-request/accept` or replies with a message (`/app/chat.sendMessage` from the recipient is allowed for a REQUESTED room addressed to them). Accepting adds the recipient's participant row (MEMBER) with the same conditional-transition-then-insert path as AC-009-2; the recipient gets `ROOM_ADDED`, the sender gets `ROOM_UPDATED` with `state: ACTIVE`. Declining (`POST .../dm-request/decline`) soft-deletes the room, clears `memberKey`, writes a `DM_REQUEST` cooldown row for the pair (30 days) and sends `ROOM_REMOVED {reason: DECLINED}` to the sender. -> Implemented. Test: DirectMessageRequestServiceTest#accept_recipient_decidesThenAddsMemberThenActivatesAndNotifiesBoth, DirectMessageRequestServiceTest#decline_recipient_setsCooldownSoftDeletesRoomAndNotifiesSender, MessageServiceTest#sendMessage_recipientRepliesToRequest_acceptsThenSavesMessage, DmRequestIT#acceptAndDecline_concurrentlyOnOneRequest_exactlyOneWinsWithConsistentState
- AC-009-13: A request that gets no answer within 14 days is `EXPIRED`: the room is soft-deleted, `memberKey` is cleared, the sender gets `ROOM_REMOVED {reason: EXPIRED}`, and the pair has no cooldown. Expiry is checked on access (list, accept, send) and by an hourly job. -> Implemented. Test: DirectMessageRequestServiceTest#accept_expiredRequest_expiresClosesRoomNotifiesSenderAndThrowsNotFound, DmRequestIT#expiryJob_pastRequest_expiresSoftDeletesRoomWithoutCooldownAndKeepsFreshOnes
- AC-009-14: A user may create at most 20 new DM requests per day (AC-009-29). Returning an existing DM does not count. -> Test: planned (CM-078)

### Blocking — CM-073
- AC-009-15: `PUT /api/v1/users/{userId}/block` (idempotent, 204), `DELETE /api/v1/users/{userId}/block` (idempotent, 204) and `GET /api/v1/users/me/blocks` (`{id, name, avatarUrl, blockedAt}`) act on the caller's own blocks only. Blocking yourself returns 400; an unknown user returns 404. -> Implemented. Test: UserApiControllerTest#blockUser_twice_returns204BothTimesWithCallerAsBlocker, UserApiControllerTest#unblockUser_twice_returns204BothTimes, UserApiControllerTest#blockUser_self_returns400, UserApiControllerTest#blockUser_unknownUser_returns404, BlockServiceTest#block_alreadyBlocked_succeedsWithoutSecondRow, BlockServiceTest#unblock_noBlock_succeeds, BlockServiceTest#block_self_throwsInvalidArgumentWithoutLookup, BlockServiceTest#block_unknownUser_throwsUserNotFoundWithoutInsert
- AC-009-16: While a block exists in either direction, the two users cannot: create a DM request, accept each other's invitation or DM request, invite each other, or exchange messages in a DM. Public and group rooms are not affected. -> Implemented. Test: BlockServiceTest#isBlockedEitherWay_blockInEitherDirection_returnsTrueForBothArgumentOrders, DirectMessageRequestServiceTest#checkCanRequest_blockEitherWay_throwsSameCannotMessageTextBothDirections, DirectMessageRequestServiceTest#accept_blockEitherWay_throwsCannotMessageWithoutDeciding, DirectMessageRequestServiceTest#acceptByReply_blockEitherWay_throwsCannotMessageWithoutDeciding, MessageServiceTest#sendMessage_dmMemberBlockedEitherWay_throwsCannotMessageWithoutSaving, MessageServiceTest#sendMessage_groupRoom_doesNotCheckBlocks
- AC-009-17: Blocked users are excluded from user search (SPEC-006) in both directions. -> Implemented. Test: UserRepositoryIT#findByNameContainingIgnoreCaseAndIdNotIn_blockedEitherWay_excludesBothDirections, UserServiceTest#searchUsers_blockedEitherWay_excludesBlockedUsersAndCaller
- AC-009-18: Every blocked action returns the same response, 403 "Cannot message this user" (or "Cannot invite this user"), so the blocked user cannot tell that they are blocked. On STOMP the error code is `FORBIDDEN_ACTION` with the same message. -> Implemented. Test: BlockServiceTest#genericMessages_blockedActions_doNotNameTheBlocker, InvitationServiceTest#accept_inviterBlockedEitherWay_throwsSameCannotInviteWithoutDecision, DirectMessageRequestServiceTest#checkCanRequest_blockEitherWay_throwsSameCannotMessageTextBothDirections, StompMessagingIT#sendMessage_blockedDm_bothGetForbiddenActionHistoryReadableAndUnblockRestores
- AC-009-19: An existing DM becomes read-only in both directions while the block exists. History stays readable. `GET /rooms` and `GET /rooms/{id}` return `blocked: true` for that DM to the blocker only (the blocked user sees a normal DM whose sends fail with AC-009-18). Unblocking restores sending; the DM is not recreated. -> Implemented. Test: StompMessagingIT#sendMessage_blockedDm_bothGetForbiddenActionHistoryReadableAndUnblockRestores, MessageServiceTest#getMessages_blockedDm_historyStaysReadableWithoutBlockCheck, MessageServiceTest#sendMessage_dmAfterUnblock_savesMessage, ChatRoomServiceTest#toResponses_dmBlockedByCaller_flagsBlockedForBlockerOnly

### Reporting — CM-074
- AC-009-20: `POST /api/v1/reports` with `{targetType: USER|MESSAGE|ROOM, targetId, reason: SPAM|HARASSMENT|INAPPROPRIATE|OTHER, note?}` stores a report and returns 202. The note is at most 500 characters. The reporter must be able to see the target (a MESSAGE or ROOM in a room they belong to, any existing USER); otherwise 404. The same reporter and target counts once (a repeat still returns 202). The reporter gets no status or notice. Limit: 10 per day per user (AC-009-29). Logs contain the ids and reason, never the message content or note. -> Test: planned (CM-074)

### Hiding and deleting DMs — CM-075
- AC-009-21: `POST /api/v1/rooms/{roomId}/hide` (DM members only; group rooms 400) sets `hiddenAt` on the caller's participant row. The room leaves that user's `GET /rooms`, and the caller's other sessions get `ROOM_REMOVED {reason: HIDDEN}`. When a message is persisted after `hiddenAt`, `hiddenAt` is cleared for that member and the normal `ROOM_ACTIVITY` is sent, so the room reappears (the client fetches it once if it is not in its list, SPEC-008 §5). The other member is not affected. -> Implemented. Test: ChatRoomServiceTest#hideRoom_directMessage_hidesForCallerOnlyAndNotifiesCallerSessions, ChatRoomServiceTest#getList_roomHiddenByCaller_excludedForCallerOnly, MessageServiceTest#sendMessage_persistedText_clearsEarlierHiddenAtBeforeActivity, ChatRoomControllerWebMvcTest#hideRoom_groupRoom_returns400Problem
- AC-009-22: DELETE on a DM returns 403 with the message "Use hide for direct messages". Soft delete of a room is kept for group rooms only (AC-002-6). -> Implemented. Test: ChatRoomControllerWebMvcTest#deleteRoom_directMessage_returns403UseHideProblem, ChatRoomServiceTest#deleteChatRoomById_directMessage_throwsForbiddenUseHide

### Roles and ownership — CM-076
- AC-009-23: `PATCH /api/v1/rooms/{roomId}/members/{userId}/role` with `{role: ADMIN|MEMBER}` is for the OWNER only (others 403, non-members of the room 404). The owner cannot target self; the OWNER role cannot be set here (400). A non-member target returns 404. A SYSTEM message is posted ("X is now an admin" / "X is now a member") and members' clients refresh `myRole` from `ROOM_UPDATED` sent to the target. -> Implemented. Test: `ChatRoomControllerAuthorizationTest#roleChange_ownerPromotesMemberToAdmin_returns204`, `ChatRoomControllerAuthorizationTest#roleChange_ownerTargetingSelf_returns403`, `ChatRoomControllerAuthorizationTest#roleChange_targetIsOwner_returns403`, `ChatRoomControllerAuthorizationTest#roleChange_nonMemberCaller_returns404`
- AC-009-24: When the owner calls `DELETE .../members/me`, the OWNER role moves to the earliest-joined ADMIN, or else the earliest-joined MEMBER, with a conditional update, before the owner row is removed. A SYSTEM message is posted ("X is now the owner"), the new owner gets `ROOM_UPDATED`. If the owner is the only member, the room is soft-deleted (as AC-002-6). DMs keep "leave forbidden" (AC-003-3). -> Implemented. Test: `ParticipantServiceTest#findSuccessor_adminsAndMembers_picksEarliestJoinedAdmin`, `ChatRoomServiceTest#leaveChatRoomById_owner_transfersOwnershipToEarliestAdminBeforeRemovingOwnerRow`, `ChatRoomServiceTest#leaveChatRoomById_soleOwner_softDeletesRoomAndNotifiesMembers`, `RoomOwnershipIT#leaveChatRoomById_ownerAndAdminsLeaveConcurrently_keepsExactlyOneOwner`
- AC-009-25: Room authorization (update, delete, role change, invitations, member removal) checks `role = OWNER` or `ADMIN` from participants, not `createdBy`. `createdBy` is kept as history only. -> Implemented. Test: `ChatRoomServiceTest#updateChatRoomById_adminPromotedAfterCreation_updatesRoom`, `ChatRoomServiceTest#updateChatRoomById_createdByWithoutOwnerRole_throwsUnauthorized`, `ChatRoomServiceTest#deleteChatRoomById_adminRole_throwsUnauthorized`

### Removal and rejoin — deferred to v1 (D-03)
- AC-009-26: not in v0. A removed PUBLIC member may rejoin through Discover at once.

### Mute — deferred to v1 (D-03)
- AC-009-27: not in v0 (no push notifications exist, so mute only hides a badge). The existing `participants.isMuted` field stays unused.

### Deleted users — CM-077
- AC-009-28: A message or member whose user no longer exists shows the label "Deleted user" and keeps its messages. The backend fallback name changes from today's "Unknown User" (`MessageService`) to "Deleted user" in history, `ROOM_ACTIVITY.senderName`, the member list and `counterpart`; the client renders it with a neutral avatar and no "Message" action. The rest of the room works as usual. -> Test: planned (CM-077) -> Implemented. Test: MessageServiceTest#getMessages_missingSender_labelsDeletedUser, MessageServiceTest#sendMessage_namelessSender_labelsRoomActivityDeletedUser, ChatRoomServiceTest#toResponses_directRoomWithMissingUser_showsDeletedUserCounterpart, ParticipantServiceTest#getMembers_missingUser_listsDeletedUser, MessageList.grouping.test.tsx#render_deletedUserSender_showsNeutralAvatarAndNoAction, RoomInfoDialog.test.tsx#render_memberWithoutName_showsDeletedUserWithNeutralAvatar

### Rate limits — CM-078
- AC-009-29: Per user per day (defaults, SPEC-007 AC-007-6): room creation 20, invitations 50, DM requests 20, reports 10. Exceeding returns 429 `RATE_LIMITED` with `Retry-After`. -> Implemented. Test: `DirectMessageRequestServiceTest#checkCanRequest_dailyDmRequestLimitReached_throwsRateLimitExceeded`, `DirectMessageRequestServiceTest#resolveRequested_sameSenderAgain_doesNotConsumeDailyDmRequestLimit`, `ChatRoomServiceTest#createRoom_dailyRoomLimitReached_throwsRateLimitWithoutSaving`, `InvitationServiceTest#invite_dailyInvitationLimitReached_throwsRateLimitWithoutInsert`, `ReportServiceTest#createReport_dailyReportLimitReached_throwsRateLimitWithoutSaving`, `RateLimitingServiceTest#checkDailyAction_twentyFirstDmRequest_throwsRateLimitExceededWithRetryAfter`

## 6. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| Accept an invitation after it expired | Not pending | 409 `INVITATION_NOT_PENDING` |
| Accept an invitation after the room was deleted | Not found | 404 |
| Accept with a full room | Not added, invitation stays PENDING until expiry | 409 `ROOM_FULL` |
| Accept the same invitation twice concurrently | One membership | second call 409 `INVITATION_NOT_PENDING` |
| Invite a user who has a PENDING invitation to the same room | Rejected | 409 `DUPLICATE_RESOURCE` |
| Sender sends a second message while `REQUESTED` | Rejected | STOMP `DM_REQUEST_PENDING` |
| Recipient creates a DM back while a request to them is pending | Request accepted | 200, `state: ACTIVE` |
| Sender re-requests within 30 days of a decline | Generic refusal | 403 "Cannot message this user" |
| Blocked user tries to message | Generic refusal | 403 / STOMP `FORBIDDEN_ACTION` |
| Block while a DM request is pending | Request hidden from the recipient's list; sends refused | 403 |
| Owner leaves a room with no other members | Room soft-deleted | 200 |
| Owner leaves and an ADMIN exists | Earliest ADMIN becomes owner | 200 |
| DELETE on a DM | Refused, use hide | 403 |
| Hide a group room | Rejected | 400 |
| Report the same target twice | Counted once | 202 |
| Report a message in a room the reporter is not in | Not found | 404 |

## 7. Security & Authorization
- Every action is decided on the server from the principal (SPEC-002 §6). No identity comes from the body.
- Invitations and DM requests expose only the caller's own rows, and a room's rows only to its OWNER and ADMIN.
- Block checks run on the server for every DM send and every create, invite or accept; the client is never trusted.
- Responses to blocked users, and rejected invitation or request attempts, do not reveal which rule failed beyond the stated message.
- Reports are visible to nobody in v0 (no moderation UI).

## 8. Non-functional
- New collections: `membership_requests`, `user_blocks`, `reports` (`room_removals` is v1). Indexes are listed in `design/data-model.md`.
- The block check on message send is one indexed lookup, and only for DM rooms.
- The expiry job runs hourly, handles rows in batches, and is idempotent (v0 runs one backend instance, D-11).
- Each new endpoint and event type is added to `design/websocket-protocol.md` and the OpenAPI spec (AGENTS.md §3).
- Logs never contain message content, previews or report notes.

## 9. Open questions
All resolved 2026-10-12 (docs/plan/MVP_V0_PLAN.md, Decisions):
1. Join request entry point: join requests and invite links are v1 (D-02).
2. Accepting a DM request: explicit accept, or a reply, or the recipient creating the same DM (D-04).
3. Blocked DM: read-only both ways, history kept (D-05).
4. Numbers: invitation 7 days, DM request 14 days, DM decline cooldown 30 days, rate limits in AC-009-29 (D-05).
5. Reports: stored only; the first real review is manual, from the database, until v1 (D-05).
