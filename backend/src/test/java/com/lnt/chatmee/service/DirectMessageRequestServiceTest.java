package com.lnt.chatmee.service;

import static org.mockito.Mockito.verifyNoMoreInteractions;

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
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import com.lnt.chatmee.dto.event.LastMessageSummary;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.DmRequestResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ErrorCode;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.RateLimitExceededException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.RoomState;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MembershipRequestRepository;
import com.lnt.chatmee.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class DirectMessageRequestServiceTest {
    @Mock MembershipRequestRepository requests;
    @Mock ChatRoomRepository rooms;
    @Mock UserRepository users;
    @Mock ParticipantService participants;
    @Mock UserEventPublisher userEvents;
    @Mock ObjectProvider<ChatRoomService> chatRoomProvider;
    @Mock ChatRoomService chatRooms;
    @Mock RateLimitingService rateLimiting;
    @Mock BlockService blocks;

    @InjectMocks DirectMessageRequestService service;

    private ChatRoom room;
    private final User alice = User.builder().id("alice").name("Alice").avatarUrl("a.png").build();

    @BeforeEach
    void setUp() {
        room = ChatRoom.builder().id("dm").type(RoomType.DIRECT_MESSAGE).state(RoomState.REQUESTED).isActive(true)
            .createdBy("alice").memberKey("alice:bob").maxParticipants(2).memberCount(1).build();
        lenient().when(chatRoomProvider.getObject()).thenReturn(chatRooms);
        lenient().when(rooms.findByIdAndIsActiveTrue("dm")).thenReturn(Optional.of(room));
        lenient().when(users.findById("alice")).thenReturn(Optional.of(alice));
        lenient().when(chatRooms.toResponse(any(ChatRoom.class), anyString())).thenAnswer(call ->
            ChatRoomResponse.builder().id("dm").state(((ChatRoom) call.getArgument(0)).getState())
                .myRole(call.getArgument(1).equals("alice") ? Role.OWNER : Role.MEMBER).build());
        lenient().when(requests.insert(any(MembershipRequest.class))).thenAnswer(call -> {
            MembershipRequest row = call.getArgument(0);
            row.setId("req-1");
            return row;
        });
    }

    // AC1: creation and same-pair rules

    @Test
    void open_newRequestedRoom_storesPendingRequestForFourteenDaysAndNotifiesRecipient() {
        service.open(room, "alice", "bob");

        verify(requests).insert(argThat((MembershipRequest row) -> row.getKind() == MembershipRequestKind.DM_REQUEST
            && row.getStatus() == MembershipRequestStatus.PENDING && row.getRoomId().equals("dm")
            && row.getInviterId().equals("alice") && row.getTargetUserId().equals("bob")
            && row.getPairKey().equals("alice:bob")
            && Duration.between(row.getCreatedAt(), row.getExpiresAt()).equals(Duration.ofDays(14))));
        verify(userEvents).dmRequestReceived(eq("bob"), argThat((DmRequestResponse request) ->
            request.roomId().equals("dm") && request.sender().id().equals("alice")
                && request.sender().name().equals("Alice") && request.sender().avatarUrl().equals("a.png")
                && request.preview() == null));
    }

    @Test
    void open_requestInsertFails_closesTheRoomAndRethrows() {
        when(requests.insert(any(MembershipRequest.class))).thenThrow(new IllegalStateException("db down"));
        when(rooms.softDeleteRequested(eq("dm"), any(LocalDateTime.class))).thenReturn(1L);

        assertThrows(IllegalStateException.class, () -> service.open(room, "alice", "bob"));

        verify(participants).removeAllParticipants("dm");
        verifyNoInteractions(userEvents);
    }

    @Test
    void resolveRequested_sameSenderAgain_returnsTheRequestedRoomWithoutDeciding() {
        when(requests.findFirstByRoomIdAndKindAndStatus("dm", MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING)).thenReturn(Optional.of(pending(Instant.now().plusSeconds(600))));

        Optional<ChatRoomResponse> resolved = service.resolveRequested(room, "alice");

        assertThat(resolved).map(ChatRoomResponse::state).contains(RoomState.REQUESTED);
        verify(requests, never()).decidePending(anyString(), any(), any());
        verify(participants, never()).insertMember(anyString(), anyString(), any());
    }

    @Test
    void resolveRequested_sameSenderAgain_doesNotConsumeDailyDmRequestLimit() {
        when(requests.findFirstByRoomIdAndKindAndStatus("dm", MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING)).thenReturn(Optional.of(pending(Instant.now().plusSeconds(600))));

        service.resolveRequested(room, "alice");

        verifyNoInteractions(rateLimiting);
    }

    @Test
    void resolveRequested_recipientCreatesSamePair_acceptsAndReturnsActiveRoom() {
        when(requests.findFirstByRoomIdAndKindAndStatus("dm", MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING)).thenReturn(Optional.of(pending(Instant.now().plusSeconds(600))));
        acceptSucceeds();

        Optional<ChatRoomResponse> resolved = service.resolveRequested(room, "bob");

        assertThat(resolved).map(ChatRoomResponse::state).contains(RoomState.ACTIVE);
        verify(participants).insertMember("dm", "bob", Role.MEMBER);
        verify(rooms).activateRequested(eq("dm"), any(LocalDateTime.class));
    }

    @Test
    void resolveRequested_expiredRequest_closesRoomAndReturnsEmpty() {
        when(requests.findFirstByRoomIdAndKindAndStatus("dm", MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING)).thenReturn(Optional.of(pending(Instant.now().minusSeconds(1))));
        when(requests.expireIfPast(eq("req-1"), any(Instant.class))).thenReturn(1L);
        when(rooms.softDeleteRequested(eq("dm"), any(LocalDateTime.class))).thenReturn(1L);

        assertThat(service.resolveRequested(room, "alice")).isEmpty();
        verify(userEvents).roomRemoved(Set.of("alice"), "dm", "EXPIRED");
    }

    @Test
    void checkCanRequest_declineCooldownForPair_throwsCannotMessageThisUser() {
        when(requests.existsByPairKeyAndCooldownUntilAfter(eq("alice:bob"), any(Instant.class))).thenReturn(true);

        ForbiddenActionException error = assertThrows(ForbiddenActionException.class,
            () -> service.checkCanRequest("bob", "alice"));

        assertEquals("Cannot message this user", error.getMessage());
        assertEquals(ErrorCode.FORBIDDEN_ACTION, error.getErrorCode());
    }

    @Test
    void checkCanRequest_dailyDmRequestLimitReached_throwsRateLimitExceeded() {
        when(requests.existsByPairKeyAndCooldownUntilAfter(eq("alice:bob"), any(Instant.class))).thenReturn(false);
        doThrow(new RateLimitExceededException(3600)).when(rateLimiting)
            .checkDailyAction(RateLimitingService.DailyAction.DM_REQUEST, "alice");

        assertThrows(RateLimitExceededException.class, () -> service.checkCanRequest("alice", "bob"));
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void checkCanRequest_noCooldown_allowsRequest() {
        when(requests.existsByPairKeyAndCooldownUntilAfter(eq("alice:bob"), any(Instant.class))).thenReturn(false);

        service.checkCanRequest("alice", "bob");
    }

    // AC3: accept, decline and expiry

    @Test
    void accept_recipient_decidesThenAddsMemberThenActivatesAndNotifiesBoth() {
        pendingForRoom(Instant.now().plusSeconds(600));
        acceptSucceeds();

        service.accept("dm", "bob");

        InOrder order = inOrder(requests, participants, rooms, userEvents);
        order.verify(requests).decidePending(eq("req-1"), any(Instant.class), eq(MembershipRequestStatus.ACCEPTED));
        order.verify(participants).insertMember("dm", "bob", Role.MEMBER);
        order.verify(rooms).activateRequested(eq("dm"), any(LocalDateTime.class));
        order.verify(userEvents).roomAdded(eq("bob"), argThat(view -> view.state() == RoomState.ACTIVE
            && view.myRole() == Role.MEMBER));
        order.verify(userEvents).roomUpdated(eq("alice"), argThat(view -> view.state() == RoomState.ACTIVE
            && view.myRole() == Role.OWNER));
    }

    @Test
    void accept_sender_throwsNotFoundWithoutDeciding() {
        pendingForRoom(Instant.now().plusSeconds(600));

        assertThrows(ChatRoomNotFoundException.class, () -> service.accept("dm", "alice"));

        verify(requests, never()).decidePending(anyString(), any(), any());
    }

    @Test
    void accept_strangerOrNoPendingRequest_throwsNotFound() {
        pendingForRoom(Instant.now().plusSeconds(600));

        assertThrows(ChatRoomNotFoundException.class, () -> service.accept("dm", "carol"));
        assertThrows(ChatRoomNotFoundException.class, () -> service.decline("dm", "carol"));
        verify(requests, never()).decidePending(anyString(), any(), any());
    }

    @Test
    void accept_lostToConcurrentDecision_throwsNotFoundWithoutMember() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(requests.decidePending(eq("req-1"), any(Instant.class), eq(MembershipRequestStatus.ACCEPTED)))
            .thenReturn(0L);

        assertThrows(ChatRoomNotFoundException.class, () -> service.accept("dm", "bob"));

        verify(participants, never()).insertMember(anyString(), anyString(), any());
        verifyNoInteractions(userEvents);
    }

    @Test
    void accept_memberInsertFails_reopensRequestAndRethrows() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(requests.decidePending(eq("req-1"), any(Instant.class), eq(MembershipRequestStatus.ACCEPTED)))
            .thenReturn(1L);
        when(participants.insertMember("dm", "bob", Role.MEMBER))
            .thenThrow(new RoomCapacityExceededException("Room has reached maximum capacity"));

        assertThrows(RoomCapacityExceededException.class, () -> service.accept("dm", "bob"));

        verify(requests).reopenAccepted("req-1");
        verify(rooms, never()).activateRequested(anyString(), any());
        verifyNoInteractions(userEvents);
    }

    @Test
    void decline_recipient_setsCooldownSoftDeletesRoomAndNotifiesSender() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(requests.declinePending(eq("req-1"), any(Instant.class), any(Instant.class))).thenReturn(1L);
        when(rooms.softDeleteRequested(eq("dm"), any(LocalDateTime.class))).thenReturn(1L);

        service.decline("dm", "bob");

        verify(requests).declinePending(eq("req-1"), any(Instant.class), argThat(until ->
            Duration.between(Instant.now(), until).compareTo(Duration.ofDays(30).minusMinutes(1)) > 0
                && Duration.between(Instant.now(), until).compareTo(Duration.ofDays(30)) <= 0));
        verify(participants).removeAllParticipants("dm");
        verify(userEvents).roomRemoved(Set.of("alice"), "dm", "DECLINED");
        verify(userEvents).dmRequestsChanged("bob");
        verifyNoMoreInteractions(userEvents);
    }

    @Test
    void decline_lostToConcurrentAccept_throwsNotFoundAndKeepsRoom() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(requests.declinePending(eq("req-1"), any(Instant.class), any(Instant.class))).thenReturn(0L);

        assertThrows(ChatRoomNotFoundException.class, () -> service.decline("dm", "bob"));

        verify(rooms, never()).softDeleteRequested(anyString(), any());
        verifyNoInteractions(userEvents);
    }

    @Test
    void accept_expiredRequest_expiresClosesRoomNotifiesSenderAndThrowsNotFound() {
        pendingForRoom(Instant.now().minusSeconds(1));
        when(requests.expireIfPast(eq("req-1"), any(Instant.class))).thenReturn(1L);
        when(rooms.softDeleteRequested(eq("dm"), any(LocalDateTime.class))).thenReturn(1L);

        assertThrows(ChatRoomNotFoundException.class, () -> service.accept("dm", "bob"));

        verify(requests, never()).decidePending(anyString(), any(), any());
        verify(participants).removeAllParticipants("dm");
        verify(userEvents).roomRemoved(Set.of("alice"), "dm", "EXPIRED");
    }

    @Test
    void expire_alreadyDecided_doesNothing() {
        when(requests.expireIfPast(eq("req-1"), any(Instant.class))).thenReturn(0L);

        assertThat(service.expire(pending(Instant.now().minusSeconds(1)), Instant.now())).isFalse();

        verifyNoInteractions(userEvents);
        verify(rooms, never()).softDeleteRequested(anyString(), any());
    }

    @Test
    void acceptByReply_recipientWithPendingRequest_acceptsAndReturnsTrue() {
        pendingForRoom(Instant.now().plusSeconds(600));
        acceptSucceeds();

        assertThat(service.acceptByReply("dm", "bob")).isTrue();

        verify(participants).insertMember("dm", "bob", Role.MEMBER);
        verify(userEvents).roomAdded(eq("bob"), any(ChatRoomResponse.class));
    }

    @Test
    void acceptByReply_strangerWithoutRequest_returnsFalse() {
        pendingForRoom(Instant.now().plusSeconds(600));

        assertThat(service.acceptByReply("dm", "carol")).isFalse();

        verify(requests, never()).decidePending(anyString(), any(), any());
    }

    // AC-009-11: listing and preview

    @Test
    void listPending_recipient_mapsSenderAndPreviewAndExpiresPastRows() {
        Instant now = Instant.now();
        MembershipRequest open = pending(now.plusSeconds(600));
        MembershipRequest past = MembershipRequest.builder().id("req-0").kind(MembershipRequestKind.DM_REQUEST)
            .roomId("old").inviterId("alice").targetUserId("bob").status(MembershipRequestStatus.PENDING)
            .createdAt(now.minusSeconds(3600)).expiresAt(now.minusSeconds(1)).build();
        when(requests.findByTargetUserIdAndKindAndStatusOrderByCreatedAtDesc("bob", MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING)).thenReturn(List.of(open, past));
        when(requests.expireIfPast(eq("req-0"), any(Instant.class))).thenReturn(1L);
        when(rooms.softDeleteRequested(eq("old"), any(LocalDateTime.class))).thenReturn(1L);
        room.setLastMessage(new LastMessageSummary("m1", "alice", "Alice", "hi there", now));
        when(rooms.findAllById(Set.of("dm"))).thenReturn(List.of(room));
        when(users.findAllById(Set.of("alice"))).thenReturn(List.of(alice));

        List<DmRequestResponse> listed = service.listPending("bob");

        assertThat(listed).singleElement().satisfies(request -> {
            assertThat(request.roomId()).isEqualTo("dm");
            assertThat(request.sender().name()).isEqualTo("Alice");
            assertThat(request.preview()).isEqualTo("hi there");
            assertThat(request.expiresAt()).isEqualTo(open.getExpiresAt());
        });
        verify(userEvents).roomRemoved(Set.of("alice"), "old", "EXPIRED");
    }

    @Test
    void previewChanged_pendingRequest_resendsRequestWithPreviewToRecipient() {
        pendingForRoom(Instant.now().plusSeconds(600));
        room.setLastMessage(new LastMessageSummary("m1", "alice", "Alice", "hi there", Instant.now()));

        service.previewChanged("dm");

        verify(userEvents).dmRequestReceived(eq("bob"), argThat((DmRequestResponse request) ->
            request.roomId().equals("dm") && "hi there".equals(request.preview())));
    }

    // CM-073 AC2: blocks refuse create and accept with the cooldown's text, both directions (AC-009-16, AC-009-18)

    @Test
    void checkCanRequest_blockEitherWay_throwsSameCannotMessageTextBothDirections() {
        when(blocks.isBlockedEitherWay("alice", "bob")).thenReturn(true);
        when(blocks.isBlockedEitherWay("bob", "alice")).thenReturn(true);

        ForbiddenActionException fromAlice = assertThrows(ForbiddenActionException.class,
            () -> service.checkCanRequest("alice", "bob"));
        ForbiddenActionException fromBob = assertThrows(ForbiddenActionException.class,
            () -> service.checkCanRequest("bob", "alice"));

        assertEquals("Cannot message this user", fromAlice.getMessage());
        assertEquals(fromAlice.getMessage(), fromBob.getMessage());
        assertEquals(ErrorCode.FORBIDDEN_ACTION, fromBob.getErrorCode());
        verifyNoInteractions(rateLimiting);
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void accept_blockEitherWay_throwsCannotMessageWithoutDeciding() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(blocks.isBlockedEitherWay("alice", "bob")).thenReturn(true);

        ForbiddenActionException ex = assertThrows(ForbiddenActionException.class, () -> service.accept("dm", "bob"));

        assertEquals("Cannot message this user", ex.getMessage());
        verify(requests, never()).decidePending(anyString(), any(), any());
        verifyNoInteractions(participants, userEvents);
    }

    @Test
    void acceptByReply_blockEitherWay_throwsCannotMessageWithoutDeciding() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(blocks.isBlockedEitherWay("alice", "bob")).thenReturn(true);

        ForbiddenActionException ex = assertThrows(ForbiddenActionException.class,
            () -> service.acceptByReply("dm", "bob"));

        assertEquals("Cannot message this user", ex.getMessage());
        verify(requests, never()).decidePending(anyString(), any(), any());
    }

    @Test
    void resolveRequested_recipientCreatesSamePairWhileBlocked_throwsCannotMessage() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(blocks.isBlockedEitherWay("alice", "bob")).thenReturn(true);

        ForbiddenActionException ex = assertThrows(ForbiddenActionException.class,
            () -> service.resolveRequested(room, "bob"));

        assertEquals("Cannot message this user", ex.getMessage());
        verify(requests, never()).decidePending(anyString(), any(), any());
    }

    @Test
    void listPending_requestFromUserBlockedEitherWay_isHidden() {
        Instant now = Instant.now();
        MembershipRequest fromAlice = pending(now.plusSeconds(600));
        MembershipRequest fromCarol = MembershipRequest.builder().id("req-2").kind(MembershipRequestKind.DM_REQUEST)
            .roomId("dm2").inviterId("carol").targetUserId("bob").status(MembershipRequestStatus.PENDING)
            .createdAt(now).expiresAt(now.plusSeconds(600)).build();
        when(requests.findByTargetUserIdAndKindAndStatusOrderByCreatedAtDesc("bob", MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING)).thenReturn(List.of(fromCarol, fromAlice));
        when(blocks.blockedEitherWay("bob")).thenReturn(Set.of("carol"));
        when(rooms.findAllById(Set.of("dm"))).thenReturn(List.of(room));
        when(users.findAllById(Set.of("alice"))).thenReturn(List.of(alice));

        List<DmRequestResponse> listed = service.listPending("bob");

        assertThat(listed).extracting(DmRequestResponse::roomId).containsExactly("dm");
    }

    @Test
    void previewChanged_blockEitherWay_sendsNoDmRequestReceived() {
        pendingForRoom(Instant.now().plusSeconds(600));
        when(blocks.isBlockedEitherWay("alice", "bob")).thenReturn(true);

        service.previewChanged("dm");

        verify(userEvents, never()).dmRequestReceived(anyString(), any());
    }

    private void acceptSucceeds() {
        when(requests.decidePending(eq("req-1"), any(Instant.class), eq(MembershipRequestStatus.ACCEPTED)))
            .thenReturn(1L);
        when(rooms.activateRequested(eq("dm"), any(LocalDateTime.class))).thenAnswer(call -> {
            room.setState(RoomState.ACTIVE);
            return 1L;
        });
    }

    private void pendingForRoom(Instant expiresAt) {
        lenient().when(requests.findFirstByRoomIdAndKindAndStatus("dm", MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING)).thenReturn(Optional.of(pending(expiresAt)));
    }

    private static MembershipRequest pending(Instant expiresAt) {
        return MembershipRequest.builder().id("req-1").kind(MembershipRequestKind.DM_REQUEST).roomId("dm")
            .inviterId("alice").targetUserId("bob").status(MembershipRequestStatus.PENDING).pairKey("alice:bob")
            .createdAt(expiresAt.minus(Duration.ofDays(14))).expiresAt(expiresAt).build();
    }
}
