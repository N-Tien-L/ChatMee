package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Spy;
import com.lnt.chatmee.service.policy.*;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class ParticipantServiceTest {
    @Mock ParticipantRepository participants;
    @Mock UserRepository users;
    @Mock ChatRoomRepository rooms;
    @Spy RoomTypePolicyRegistry policies = new RoomTypePolicyRegistry(List.of(
        new PublicRoomPolicy(), new PrivateRoomPolicy(), new DirectRoomPolicy()));
    @Mock UserEventPublisher userEvents;
    @Mock org.springframework.beans.factory.ObjectProvider<MessageService> messages;
    @Mock MessageService messageService;

    @InjectMocks ParticipantService service;
    private ChatRoom room;

    @BeforeEach
    void setUp() {
        lenient().when(messages.getObject()).thenReturn(messageService);
        room = ChatRoom.builder().id("room").type(RoomType.PUBLIC).isActive(true)
                .maxParticipants(10).build();
    }

    @Test
    void joinRoom_publicRoom_addsMember() {
        joinUser();
        targetAndRoom("actor");
        when(participants.findByChatRoomId("room")).thenReturn(List.of(Participant.builder().userId("actor").build()));
        service.joinRoom("room", "actor");
        verify(userEvents).roomAdded(eq("actor"), argThat(r -> r.id().equals("room") && r.participants().equals(Set.of("actor"))));
        verifyNoMoreInteractions(userEvents);
        verify(messageService).postSystemMessage("room", "Deleted user joined");
        verify(participants).save(argThat(p -> p.getUserId().equals("actor") && p.getRole() == Role.MEMBER));
        verify(rooms).reserveSeat(eq("room"), any());
        verify(rooms, never()).save(any());
    }

    @Test
    void joinRoom_deletedRoom_throwsNotFound() {
        joinUser();
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.empty());
        assertThrows(ChatRoomNotFoundException.class, () -> service.joinRoom("room", "actor"));
        verify(participants, never()).save(any());
    }

    @Test
    void addParticipant_fullRoom_throwsCapacityExceededWithoutInsert() {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        when(users.findById("target")).thenReturn(Optional.of(User.builder().id("target").build()));
        when(rooms.reserveSeat(eq("room"), any())).thenReturn(0L);

        assertThrows(RoomCapacityExceededException.class, () -> service.addParticipant("room", "target", Role.MEMBER));

        verify(participants, never()).save(any());
        verify(rooms, never()).releaseSeat(any(), any());
    }

    @Test
    void insertMember_privateRoom_seatsMemberWithoutAnnouncement() {
        room.setType(RoomType.PRIVATE);
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        User target = User.builder().id("target").name("Tara").build();
        when(users.findById("target")).thenReturn(Optional.of(target));
        when(rooms.reserveSeat(eq("room"), any())).thenReturn(1L);

        assertEquals(target, service.insertMember("room", "target", Role.MEMBER));

        verify(participants).save(argThat(p -> p.getUserId().equals("target") && p.getRole() == Role.MEMBER));
        verifyNoInteractions(messageService);
    }

    @Test
    void addParticipant_insertLosesUniqueIndexRace_releasesSeatAndThrowsAlreadyParticipant() {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        when(users.findById("target")).thenReturn(Optional.of(User.builder().id("target").build()));
        when(rooms.reserveSeat(eq("room"), any())).thenReturn(1L);
        when(participants.save(any())).thenThrow(new org.springframework.dao.DuplicateKeyException("duplicate"));

        assertThrows(UserAlreadyInRoomException.class, () -> service.addParticipant("room", "target", Role.MEMBER));

        verify(rooms).releaseSeat(eq("room"), any());
    }

    @Test
    void removeParticipant_member_deletesRowAndReleasesSeat() {
        when(participants.deleteByChatRoomIdAndUserId("room", "actor")).thenReturn(1L);

        assertTrue(service.removeParticipant("room", "actor"));

        verify(rooms).releaseSeat(eq("room"), any());
    }

    @Test
    void removeParticipant_nonMember_returnsFalseWithoutReleasingSeat() {
        when(participants.deleteByChatRoomIdAndUserId("room", "actor")).thenReturn(0L);

        assertFalse(service.removeParticipant("room", "actor"));

        verifyNoInteractions(rooms);
    }

    @Test
    void getParticipantUserIds_severalRooms_groupsByRoomInOneQuery() {
        when(participants.findByChatRoomIdIn(List.of("r1", "r2"))).thenReturn(List.of(
                Participant.builder().chatRoomId("r1").userId("a").build(),
                Participant.builder().chatRoomId("r1").userId("b").build(),
                Participant.builder().chatRoomId("r2").userId("a").build()));

        Map<String, Set<String>> members = service.getParticipantUserIds(List.of("r1", "r2"));

        assertEquals(Set.of("a", "b"), members.get("r1"));
        assertEquals(Set.of("a"), members.get("r2"));
    }

    @Test
    void getParticipantUserIds_noRooms_skipsQuery() {
        assertTrue(service.getParticipantUserIds(List.<String>of()).isEmpty());
        verifyNoInteractions(participants);
    }

    @Test
    void getRoomIdsOfUser_memberships_returnsRoomIds() {
        when(participants.findByUserId("actor")).thenReturn(List.of(
                Participant.builder().chatRoomId("r1").userId("actor").build()));

        assertEquals(List.of("r1"), service.getRoomIdsOfUser("actor"));
    }

    @Test
    void createParticipant_newMember_leavesIdAndAuditDatesToMongo() {
        service.createParticipant("room", "actor", Role.MEMBER);

        verify(participants).save(argThat(p -> p.getId() == null && p.getJoinedAt() == null
                && p.getUpdatedAt() == null && p.getRole() == Role.MEMBER));
    }

    @Test
    void joinRoom_privateRoom_throwsForbidden() { rejectJoin(RoomType.PRIVATE); }

    @Test
    void joinRoom_directMessageRoom_throwsForbidden() { rejectJoin(RoomType.DIRECT_MESSAGE); }

    @Test
    void joinRoom_existingPublicMember_throwsAlreadyParticipant() {
        joinUser();
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        when(users.findById("actor")).thenReturn(Optional.of(User.builder().id("actor").build()));
        when(participants.existsByChatRoomIdAndUserId("room", "actor")).thenReturn(true);
        UserAlreadyInRoomException failure = assertThrows(UserAlreadyInRoomException.class,
                () -> service.joinRoom("room", "actor"));
        assertEquals("User is already in the room", failure.getMessage());
        verify(participants, never()).save(any());
        verify(rooms, never()).reserveSeat(any(), any());
    }

    @Test
    void createParticipant_uniqueIndexRace_throwsAlreadyParticipant() {
        when(participants.save(any())).thenThrow(new org.springframework.dao.DuplicateKeyException("duplicate"));
        assertThrows(UserAlreadyInRoomException.class,
                () -> service.createParticipant("room", "actor", Role.MEMBER));
    }

    @Test
    void isUserParticipant_deletedRoomWithOrphanMembership_returnsFalse() {
        lenient().when(participants.existsByChatRoomIdAndUserId("room", "actor")).thenReturn(true);
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.empty());
        assertFalse(service.isUserParticipant("room", "actor"));
    }

    @Test
    void isUserParticipant_activeRoomMember_returnsTrue() {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        when(participants.existsByChatRoomIdAndUserId("room", "actor")).thenReturn(true);
        assertTrue(service.isUserParticipant("room", "actor"));
    }

    @Test
    void isUserParticipant_activeRoomNonMember_returnsFalse() {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        assertFalse(service.isUserParticipant("room", "actor"));
    }

    @Test
    void findSuccessor_adminsAndMembers_picksEarliestJoinedAdmin() {
        when(participants.findByChatRoomId("room")).thenReturn(List.of(
            member("owner", Role.OWNER, 1), member("m1", Role.MEMBER, 2),
            member("a2", Role.ADMIN, 4), member("a1", Role.ADMIN, 3)));

        assertThat(service.findSuccessor("room", "owner")).map(Participant::getUserId).contains("a1");
    }

    @Test
    void findSuccessor_onlyMembersLeft_picksEarliestJoinedMember() {
        when(participants.findByChatRoomId("room")).thenReturn(List.of(
            member("owner", Role.OWNER, 1), member("m2", Role.MEMBER, 5), member("m1", Role.MEMBER, 2)));

        assertThat(service.findSuccessor("room", "owner")).map(Participant::getUserId).contains("m1");
    }

    @Test
    void findSuccessor_soleOwner_returnsEmpty() {
        when(participants.findByChatRoomId("room")).thenReturn(List.of(member("owner", Role.OWNER, 1)));

        assertThat(service.findSuccessor("room", "owner")).isEmpty();
    }

    private static Participant member(String userId, Role role, int joinedMinute) {
        return Participant.builder().chatRoomId("room").userId(userId).role(role)
            .joinedAt(java.time.LocalDateTime.of(2026, 10, 1, 10, joinedMinute)).build();
    }

    private void rejectJoin(RoomType type) {
        room.setType(type);
        joinUser();
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        assertThrows(ForbiddenActionException.class, () -> service.joinRoom("room", "actor"));
        verify(participants, never()).save(any());
        verify(rooms, never()).reserveSeat(any(), any());
    }

    private void joinUser() {
        when(users.findById("actor"))
                .thenReturn(Optional.of(User.builder().id("actor").build()));
    }

    private void targetAndRoom(String userId) {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        when(users.findById(userId)).thenReturn(Optional.of(User.builder().id(userId).build()));
        when(rooms.reserveSeat(eq("room"), any())).thenReturn(1L);
    }

    @Test
    void getMembers_largeRoom_readsParticipantsAndUsersOnceWithoutPerMemberLookup() {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        var rows = java.util.stream.IntStream.range(0, 1000)
            .mapToObj(i -> Participant.builder().userId("u" + i).role(i == 0 ? Role.OWNER : Role.MEMBER).build()).toList();
        when(participants.findByChatRoomId("room")).thenReturn(rows);
        when(users.findAllById(any())).thenReturn(java.util.stream.IntStream.range(0, 1000)
            .mapToObj(i -> User.builder().id("u" + i).name("User " + i).avatarUrl("avatar-" + i).build()).toList());
        var result = service.getMembers("room", "u0");
        assertEquals(1000, result.size());
        assertEquals("u0", result.get(0).id());
        assertEquals("User 0", result.get(0).name());
        assertEquals("avatar-0", result.get(0).avatarUrl());
        assertEquals(Role.OWNER, result.get(0).role());
        verify(participants).findByChatRoomId("room");
        verify(users).findAllById(any());
        verify(users, never()).findById(any());
        verifyNoMoreInteractions(participants, users);
    }

    @Test
    void getMembers_nonMember_throws404WithoutReadingUsers() {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        when(participants.findByChatRoomId("room")).thenReturn(List.of(Participant.builder().userId("other").build()));
        assertThrows(ChatRoomNotFoundException.class, () -> service.getMembers("room", "actor"));
        verifyNoInteractions(users);
    }

    @Test
    void getMembers_inactiveRoom_throws404BeforeReadingOrphanMemberships() {
        assertThrows(ChatRoomNotFoundException.class, () -> service.getMembers("room", "actor"));
        verifyNoInteractions(participants, users);
    }

    @Test
    void postSystemMessage_membershipText_persistsBeforeBroadcastWithoutActivity() {
        var messages = mock(com.lnt.chatmee.repository.MessageRepository.class);
        var messageService = new MessageService(rooms, service, messages, users, userEvents,
            mock(DirectMessageRequestService.class));
        when(messages.save(any())).thenAnswer(call -> call.getArgument(0));
        for (String text : List.of("Alice joined", "Alice left", "Bob removed Alice")) {
            var result = messageService.postSystemMessage("room", text);
            assertEquals(com.lnt.chatmee.model.Message.MessageType.SYSTEM, result.type());
            assertEquals(text, result.content());
            assertNotNull(result.id());
            assertNotNull(result.createdAt());
            var order = inOrder(messages, userEvents);
            order.verify(messages).save(argThat(m -> m.getType() == com.lnt.chatmee.model.Message.MessageType.SYSTEM && m.getContent().equals(text)));
            order.verify(userEvents).systemMessage(result);
        }
        verifyNoInteractions(rooms, users, participants);
        verify(userEvents, never()).roomActivity(any(), anyString(), any());
    }

    @Test
    void membershipChanges_joinLeaveRemove_persistAndBroadcastSystemMessagesWithoutActivity() {
        var repository = mock(com.lnt.chatmee.repository.MessageRepository.class);
        when(repository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(messages.getObject()).thenReturn(new MessageService(rooms, service, repository, users, userEvents,
            mock(DirectMessageRequestService.class)));
        room.setCreatedBy("former-owner");
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        when(users.findById("alice")).thenReturn(Optional.of(User.builder().id("alice").name("Alice").build()));
        when(rooms.reserveSeat(eq("room"), any())).thenReturn(1L);
        service.addParticipant("room", "alice", Role.MEMBER);
        when(participants.existsByChatRoomIdAndUserId("room", "alice")).thenReturn(true);
        when(participants.deleteByChatRoomIdAndUserId("room", "alice")).thenReturn(1L);
        var chatRooms = new ChatRoomService(rooms, users, repository, userEvents, service,
            mock(org.springframework.messaging.simp.SimpMessagingTemplate.class), policies,
            mock(DirectMessageRequestService.class));
        when(participants.findByChatRoomIdAndUserId("room", "alice"))
            .thenReturn(Optional.of(Participant.builder().role(Role.MEMBER).build()));
        when(participants.deleteByChatRoomIdAndUserIdAndRole("room", "alice", Role.MEMBER)).thenReturn(1L);
        chatRooms.leaveChatRoomById("alice", "room");
        when(participants.findByChatRoomIdAndUserId("room", "bob"))
            .thenReturn(Optional.of(Participant.builder().role(Role.OWNER).build()));
        when(participants.findByChatRoomIdAndUserId("room", "alice"))
            .thenReturn(Optional.of(Participant.builder().role(Role.MEMBER).build()));
        when(users.findById("bob")).thenReturn(Optional.of(User.builder().id("bob").name("Bob").build()));
        service.removeMember("room", "bob", "alice");
        var saved = org.mockito.ArgumentCaptor.forClass(com.lnt.chatmee.model.Message.class);
        verify(repository, times(3)).save(saved.capture());
        assertEquals(List.of("Alice joined", "Alice left", "Bob removed Alice"),
            saved.getAllValues().stream().map(com.lnt.chatmee.model.Message::getContent).toList());
        for (var message : saved.getAllValues()) {
            assertEquals(com.lnt.chatmee.model.Message.MessageType.SYSTEM, message.getType());
            verify(userEvents).systemMessage(argThat(response -> response.id().equals(message.getId())
                && response.content().equals(message.getContent()) && response.type() == message.getType()));
        }
        verify(rooms, never()).updateActivity(any(), any(), any());
        verify(userEvents, never()).roomActivity(any(), anyString(), any());
    }

}
