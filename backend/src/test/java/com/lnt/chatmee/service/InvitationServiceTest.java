package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.InvitationResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DuplicateResourceException;
import com.lnt.chatmee.exception.ErrorCode;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.RateLimitExceededException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.InvitationNotFoundException;
import com.lnt.chatmee.exception.InvitationNotPendingException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MembershipRequestRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.policy.DirectRoomPolicy;
import com.lnt.chatmee.service.policy.PrivateRoomPolicy;
import com.lnt.chatmee.service.policy.PublicRoomPolicy;
import com.lnt.chatmee.service.policy.RoomTypePolicyRegistry;

@ExtendWith(MockitoExtension.class)
class InvitationServiceTest {
    @Mock MembershipRequestRepository requests;
    @Mock ChatRoomRepository rooms;
    @Mock UserRepository users;
    @Mock ParticipantService participants;
    @Mock ChatRoomService chatRooms;
    @Mock UserEventPublisher userEvents;
    @Mock RateLimitingService rateLimitingService;
    @Spy RoomTypePolicyRegistry policies = new RoomTypePolicyRegistry(List.of(
        new PublicRoomPolicy(), new PrivateRoomPolicy(), new DirectRoomPolicy()));

    @InjectMocks InvitationService service;

    private ChatRoom room;
    private final User owner = User.builder().id("owner").name("Olivia").avatarUrl("o.png").build();
    private final User bob = User.builder().id("bob").name("Bob").build();

    @BeforeEach
    void setUp() {
        room = ChatRoom.builder().id("room").name("Secret").type(RoomType.PRIVATE).isActive(true)
            .maxParticipants(10).memberCount(1).build();
        lenient().when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        lenient().when(users.findById("owner")).thenReturn(Optional.of(owner));
        lenient().when(users.findById("bob")).thenReturn(Optional.of(bob));
        lenient().when(requests.insert(any(MembershipRequest.class))).thenAnswer(call -> {
            MembershipRequest row = call.getArgument(0);
            row.setId("inv-1");
            return row;
        });
    }

    // AC1: invite rules

    @Test
    void invite_ownerInvitesUser_storesPendingInvitationForSevenDaysAndNotifiesInvitee() {
        caller("owner", Role.OWNER);

        InvitationResponse response = service.invite("room", "owner", "bob");

        verify(requests).insert(argThat((MembershipRequest row) -> row.getKind() == MembershipRequestKind.INVITE
            && row.getStatus() == MembershipRequestStatus.PENDING && row.getRoomId().equals("room")
            && row.getInviterId().equals("owner") && row.getTargetUserId().equals("bob")
            && Duration.between(row.getCreatedAt(), row.getExpiresAt()).equals(Duration.ofDays(7))));
        verify(userEvents).invitationReceived("bob", response);
        assertThat(response.id()).isEqualTo("inv-1");
        assertThat(response.room()).isEqualTo(new InvitationResponse.RoomSummary("room", "Secret", 1));
        assertThat(response.inviter().name()).isEqualTo("Olivia");
        assertThat(response.inviter().avatarUrl()).isEqualTo("o.png");
        assertThat(response.invitee().id()).isEqualTo("bob");
    }

    @Test
    void invite_adminInvitesUser_storesInvitation() {
        caller("owner", Role.ADMIN);

        service.invite("room", "owner", "bob");

        verify(requests).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_dailyInvitationLimitReached_throwsRateLimitWithoutInsert() {
        caller("owner", Role.OWNER);
        doThrow(new RateLimitExceededException(60)).when(rateLimitingService)
            .checkDailyAction(RateLimitingService.DailyAction.INVITATION, "owner");

        assertThrows(RateLimitExceededException.class, () -> service.invite("room", "owner", "bob"));
        verify(requests, never()).insert(any(MembershipRequest.class));
        verifyNoInteractions(userEvents);
    }

    @Test
    void invite_memberCaller_throwsForbiddenWithoutInsert() {
        caller("owner", Role.MEMBER);

        assertEquals(ErrorCode.FORBIDDEN_ACTION,
            assertThrows(ForbiddenActionException.class, () -> service.invite("room", "owner", "bob")).getErrorCode());
        verify(requests, never()).insert(any(MembershipRequest.class));
        verifyNoInteractions(userEvents);
    }

    @Test
    void invite_nonMemberCaller_throwsNotFound() {
        when(participants.findMembership("room", "owner")).thenReturn(Optional.empty());

        assertThrows(ChatRoomNotFoundException.class, () -> service.invite("room", "owner", "bob"));
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_deletedRoom_throwsNotFound() {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.empty());

        assertThrows(ChatRoomNotFoundException.class, () -> service.invite("room", "owner", "bob"));
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_inviteeAlreadyMember_throwsAlreadyParticipant() {
        caller("owner", Role.OWNER);
        when(participants.findMembership("room", "bob")).thenReturn(Optional.of(row("bob", Role.MEMBER)));

        assertEquals(ErrorCode.ALREADY_PARTICIPANT,
            assertThrows(UserAlreadyInRoomException.class, () -> service.invite("room", "owner", "bob")).getErrorCode());
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_pendingInvitationExists_throwsDuplicateResource() {
        caller("owner", Role.OWNER);
        when(requests.findFirstByRoomIdAndTargetUserIdAndStatus("room", "bob", MembershipRequestStatus.PENDING))
            .thenReturn(Optional.of(invitation(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60))));

        assertEquals(ErrorCode.DUPLICATE_RESOURCE,
            assertThrows(DuplicateResourceException.class, () -> service.invite("room", "owner", "bob")).getErrorCode());
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_expiredPendingInvitationExists_expiresItAndStoresNewInvitation() {
        caller("owner", Role.OWNER);
        when(requests.findFirstByRoomIdAndTargetUserIdAndStatus("room", "bob", MembershipRequestStatus.PENDING))
            .thenReturn(Optional.of(invitation(MembershipRequestStatus.PENDING, Instant.now().minusSeconds(1))));

        service.invite("room", "owner", "bob");

        InOrder order = inOrder(requests);
        order.verify(requests).expireIfPast(eq("inv-1"), any());
        order.verify(requests).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_concurrentDuplicateLosesUniqueIndex_throwsDuplicateResource() {
        caller("owner", Role.OWNER);
        when(requests.insert(any(MembershipRequest.class))).thenThrow(new DuplicateKeyException("duplicate"));

        assertThrows(DuplicateResourceException.class, () -> service.invite("room", "owner", "bob"));
        verifyNoInteractions(userEvents);
    }

    @Test
    void invite_fullRoom_throwsRoomFull() {
        caller("owner", Role.OWNER);
        room.setMemberCount(10);

        assertEquals(ErrorCode.ROOM_FULL,
            assertThrows(RoomCapacityExceededException.class, () -> service.invite("room", "owner", "bob")).getErrorCode());
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_publicRoom_throwsInvalidArgument() {
        room.setType(RoomType.PUBLIC);
        caller("owner", Role.OWNER);

        assertEquals(ErrorCode.INVALID_ARGUMENT,
            assertThrows(InvalidRequestException.class, () -> service.invite("room", "owner", "bob")).getErrorCode());
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_directMessageRoom_throwsForbidden() {
        room.setType(RoomType.DIRECT_MESSAGE);
        caller("owner", Role.OWNER);

        assertThrows(ForbiddenActionException.class, () -> service.invite("room", "owner", "bob"));
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_unknownInvitee_throwsUserNotFound() {
        caller("owner", Role.OWNER);
        when(users.findById("ghost")).thenReturn(Optional.empty());

        assertThrows(com.lnt.chatmee.exception.UserNotFoundException.class, () -> service.invite("room", "owner", "ghost"));
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    // AC2 and AC4: accept

    @Test
    void accept_invitee_acceptsSeatsMemberAnnouncesAndNotifies() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.ACCEPTED))).thenReturn(1L);
        when(participants.insertMember("room", "bob", Role.MEMBER)).thenReturn(bob);
        ChatRoomResponse view = ChatRoomResponse.from(room, Set.of("owner", "bob"));
        when(chatRooms.toResponse(room, "bob")).thenReturn(view);

        service.accept("inv-1", "bob");

        InOrder order = inOrder(requests, participants, userEvents);
        order.verify(requests).decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.ACCEPTED));
        order.verify(participants).insertMember("room", "bob", Role.MEMBER);
        order.verify(participants).announceJoin("room", bob);
        verify(userEvents).invitationChanged(Set.of("bob", "owner"), "inv-1", "room", MembershipRequestStatus.ACCEPTED);
        verify(userEvents).roomAdded("bob", view);
        verify(requests, never()).reopenAccepted(anyString());
    }

    @Test
    void accept_notInvitee_throwsInvitationNotFound() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));

        for (String caller : List.of("owner", "stranger")) {
            assertEquals(ErrorCode.INVITATION_NOT_FOUND, assertThrows(InvitationNotFoundException.class,
                () -> service.accept("inv-1", caller)).getErrorCode());
        }
        verify(requests, never()).decidePending(any(), any(), any());
        verifyNoInteractions(participants);
    }

    @Test
    void accept_unknownInvitation_throwsInvitationNotFound() {
        when(requests.findById("missing")).thenReturn(Optional.empty());

        assertThrows(InvitationNotFoundException.class, () -> service.accept("missing", "bob"));
    }

    @Test
    void accept_dmRequestId_throwsInvitationNotFound() {
        MembershipRequest dm = invitation(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        dm.setKind(MembershipRequestKind.DM_REQUEST);
        when(requests.findById("inv-1")).thenReturn(Optional.of(dm));

        assertThrows(InvitationNotFoundException.class, () -> service.accept("inv-1", "bob"));
    }

    @Test
    void accept_expiredInvitation_marksExpiredAndThrowsNotPending() {
        stored(MembershipRequestStatus.PENDING, Instant.now().minusSeconds(1));

        assertEquals(ErrorCode.INVITATION_NOT_PENDING, assertThrows(InvitationNotPendingException.class,
            () -> service.accept("inv-1", "bob")).getErrorCode());
        verify(requests).expireIfPast(eq("inv-1"), any());
        verify(requests, never()).decidePending(any(), any(), any());
        verifyNoInteractions(participants);
    }

    @Test
    void accept_revokedInvitation_throwsNotPending() { rejectAccept(MembershipRequestStatus.REVOKED); }

    @Test
    void accept_declinedInvitation_throwsNotPending() { rejectAccept(MembershipRequestStatus.DECLINED); }

    @Test
    void accept_acceptedInvitation_throwsNotPending() { rejectAccept(MembershipRequestStatus.ACCEPTED); }

    @Test
    void accept_concurrentDecisionWins_throwsNotPendingWithoutSeat() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.ACCEPTED))).thenReturn(0L);

        assertThrows(InvitationNotPendingException.class, () -> service.accept("inv-1", "bob"));
        verifyNoInteractions(participants);
        verifyNoInteractions(userEvents);
    }

    @Test
    void accept_fullRoom_reopensInvitationAndThrowsRoomFull() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.ACCEPTED))).thenReturn(1L);
        when(participants.insertMember("room", "bob", Role.MEMBER))
            .thenThrow(new RoomCapacityExceededException("Room has reached maximum capacity"));

        assertEquals(ErrorCode.ROOM_FULL, assertThrows(RoomCapacityExceededException.class,
            () -> service.accept("inv-1", "bob")).getErrorCode());
        verify(requests).reopenAccepted("inv-1");
        verify(participants, never()).announceJoin(any(), any());
        verifyNoInteractions(userEvents);
    }

    @Test
    void accept_roomDeletedMeanwhile_reopensInvitationAndThrowsNotFound() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.ACCEPTED))).thenReturn(1L);
        when(participants.insertMember("room", "bob", Role.MEMBER))
            .thenThrow(new ChatRoomNotFoundException("Can't find chat room"));

        assertThrows(ChatRoomNotFoundException.class, () -> service.accept("inv-1", "bob"));
        verify(requests).reopenAccepted("inv-1");
    }

    @Test
    void accept_reopenLosesToNewerPendingInvitation_stillThrowsOriginalError() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.ACCEPTED))).thenReturn(1L);
        when(participants.insertMember("room", "bob", Role.MEMBER))
            .thenThrow(new RoomCapacityExceededException("Room has reached maximum capacity"));
        when(requests.reopenAccepted("inv-1")).thenThrow(new DuplicateKeyException("duplicate"));

        assertThrows(RoomCapacityExceededException.class, () -> service.accept("inv-1", "bob"));
    }

    // AC-009-3: decline, revoke, lists

    @Test
    void decline_invitee_setsDeclinedAndNotifiesBoth() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.DECLINED))).thenReturn(1L);

        service.decline("inv-1", "bob");

        verify(userEvents).invitationChanged(Set.of("bob", "owner"), "inv-1", "room", MembershipRequestStatus.DECLINED);
        verifyNoInteractions(participants);
    }

    @Test
    void decline_notInvitee_throwsInvitationNotFound() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));

        assertThrows(InvitationNotFoundException.class, () -> service.decline("inv-1", "owner"));
        verify(requests, never()).decidePending(any(), any(), any());
    }

    @Test
    void decline_revokedInvitation_throwsNotPending() {
        stored(MembershipRequestStatus.REVOKED, Instant.now().plusSeconds(60));

        assertThrows(InvitationNotPendingException.class, () -> service.decline("inv-1", "bob"));
    }

    @Test
    void revoke_inviter_setsRevokedAndNotifiesBoth() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.REVOKED))).thenReturn(1L);

        service.revoke("inv-1", "owner");

        verify(userEvents).invitationChanged(Set.of("bob", "owner"), "inv-1", "room", MembershipRequestStatus.REVOKED);
    }

    @Test
    void revoke_roomAdminOtherThanInviter_setsRevoked() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(participants.findMembership("room", "admin")).thenReturn(Optional.of(row("admin", Role.ADMIN)));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.REVOKED))).thenReturn(1L);

        service.revoke("inv-1", "admin");

        verify(requests).decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.REVOKED));
    }

    @Test
    void revoke_roomMemberOtherThanInviter_throwsInvitationNotFound() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(participants.findMembership("room", "carol")).thenReturn(Optional.of(row("carol", Role.MEMBER)));

        assertThrows(InvitationNotFoundException.class, () -> service.revoke("inv-1", "carol"));
        verify(requests, never()).decidePending(any(), any(), any());
    }

    @Test
    void revoke_invitee_throwsForbidden() {
        stored(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        when(participants.findMembership("room", "bob")).thenReturn(Optional.empty());

        assertThrows(ForbiddenActionException.class, () -> service.revoke("inv-1", "bob"));
        verify(requests, never()).decidePending(any(), any(), any());
    }

    @Test
    void revoke_acceptedInvitation_throwsNotPending() {
        stored(MembershipRequestStatus.ACCEPTED, Instant.now().plusSeconds(60));

        assertThrows(InvitationNotPendingException.class, () -> service.revoke("inv-1", "owner"));
    }

    @Test
    void listMine_pendingInvitations_mapsRoomInviterAndSkipsDeletedRooms() {
        MembershipRequest live = invitation(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        MembershipRequest orphan = invitation(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60));
        orphan.setId("inv-2");
        orphan.setRoomId("gone");
        when(requests.findByTargetUserIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            eq("bob"), eq(MembershipRequestKind.INVITE), eq(MembershipRequestStatus.PENDING), any()))
            .thenReturn(List.of(live, orphan));
        when(rooms.findAllById(Set.of("room", "gone"))).thenReturn(List.of(room,
            ChatRoom.builder().id("gone").isActive(false).build()));
        when(users.findAllById(Set.of("owner", "bob"))).thenReturn(List.of(owner, bob));

        List<InvitationResponse> mine = service.listMine("bob");

        assertThat(mine).extracting(InvitationResponse::id).containsExactly("inv-1");
        assertThat(mine.get(0).inviter().name()).isEqualTo("Olivia");
        assertThat(mine.get(0).room().name()).isEqualTo("Secret");
    }

    @Test
    void listForRoom_admin_returnsPendingInvitations() {
        caller("owner", Role.ADMIN);
        when(requests.findByRoomIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            eq("room"), eq(MembershipRequestKind.INVITE), eq(MembershipRequestStatus.PENDING), any()))
            .thenReturn(List.of(invitation(MembershipRequestStatus.PENDING, Instant.now().plusSeconds(60))));
        when(rooms.findAllById(Set.of("room"))).thenReturn(List.of(room));
        when(users.findAllById(Set.of("owner", "bob"))).thenReturn(List.of(owner, bob));

        assertThat(service.listForRoom("room", "owner")).extracting(i -> i.invitee().name()).containsExactly("Bob");
    }

    @Test
    void listForRoom_member_throwsForbidden() {
        caller("owner", Role.MEMBER);

        assertThrows(ForbiddenActionException.class, () -> service.listForRoom("room", "owner"));
        verify(requests, never()).findByRoomIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(any(), any(), any(), any());
    }

    @Test
    void listForRoom_nonMember_throwsNotFound() {
        when(participants.findMembership("room", "owner")).thenReturn(Optional.empty());

        assertThrows(ChatRoomNotFoundException.class, () -> service.listForRoom("room", "owner"));
    }

    private void rejectAccept(MembershipRequestStatus status) {
        stored(status, Instant.now().plusSeconds(60));
        assertEquals(ErrorCode.INVITATION_NOT_PENDING, assertThrows(InvitationNotPendingException.class,
            () -> service.accept("inv-1", "bob")).getErrorCode());
        verify(requests, never()).decidePending(any(), any(), any());
        verifyNoInteractions(participants);
    }

    private void caller(String userId, Role role) {
        when(participants.findMembership("room", userId)).thenReturn(Optional.of(row(userId, role)));
    }

    private static Participant row(String userId, Role role) {
        return Participant.builder().chatRoomId("room").userId(userId).role(role).build();
    }

    private void stored(MembershipRequestStatus status, Instant expiresAt) {
        when(requests.findById("inv-1")).thenReturn(Optional.of(invitation(status, expiresAt)));
    }

    private static MembershipRequest invitation(MembershipRequestStatus status, Instant expiresAt) {
        return MembershipRequest.builder().id("inv-1").kind(MembershipRequestKind.INVITE).roomId("room")
            .inviterId("owner").targetUserId("bob").status(status)
            .createdAt(expiresAt.minus(Duration.ofDays(7))).expiresAt(expiresAt).build();
    }
}
