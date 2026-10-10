package com.lnt.chatmee.service;

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
    @InjectMocks ParticipantService service;
    private ChatRoom room;

    @BeforeEach
    void setUp() {
        room = ChatRoom.builder().id("room").type(RoomType.PUBLIC).isActive(true)
                .maxParticipants(10).build();
    }

    @Test
    void joinRoom_publicRoom_addsMember() {
        joinUser();
        targetAndRoom("actor");
        service.joinRoom("room", "actor");
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
    void addParticipant_ownerAssigningAdmin_addsAdmin() { allowAssignment(Role.OWNER, "ADMIN", Role.ADMIN); }

    @Test
    void addParticipant_ownerAssigningMember_addsMember() { allowAssignment(Role.OWNER, "MEMBER", Role.MEMBER); }

    @Test
    void addParticipant_adminAssigningMember_addsMember() { allowAssignment(Role.ADMIN, "MEMBER", Role.MEMBER); }

    @Test
    void addParticipant_adminAssigningAdmin_throwsForbidden() { rejectAssignment(Role.ADMIN, "ADMIN"); }

    @Test
    void addParticipant_ownerAssigningOwner_throwsForbidden() { rejectAssignment(Role.OWNER, "OWNER"); }

    @Test
    void addParticipant_adminAssigningOwner_throwsForbidden() { rejectAssignment(Role.ADMIN, "OWNER"); }

    @Test
    void addParticipant_memberAssigningOwner_throwsForbidden() { rejectAssignment(Role.MEMBER, "OWNER"); }

    @Test
    void addParticipant_memberCaller_throwsForbidden() { rejectAssignment(Role.MEMBER, "MEMBER"); }

    @Test
    void addParticipant_nonParticipantCaller_throwsForbidden() {
        joinUser();
        assertThrows(ForbiddenActionException.class,
                () -> service.addParticipant("room", "actor", "target", "MEMBER"));
        verifyNoInteractions(rooms);
        verify(participants, never()).save(any());
    }

    @Test
    void addParticipant_invalidRole_throwsBadRequestException() {
        actor(Role.OWNER);
        assertThrows(com.lnt.chatmee.exception.InvalidRequestException.class,
                () -> service.addParticipant("room", "actor", "target", "INVALID"));
        verifyNoInteractions(rooms);
        verify(participants, never()).save(any());
    }

    @Test
    void addParticipant_missingRole_defaultsToMember() { allowAssignment(Role.ADMIN, null, Role.MEMBER); }

    @Test
    void addParticipant_blankRole_defaultsToMember() { allowAssignment(Role.ADMIN, "  ", Role.MEMBER); }

    @Test
    void addParticipant_lowercaseRole_addsMember() { allowAssignment(Role.ADMIN, "member", Role.MEMBER); }

    @Test
    void createParticipant_uniqueIndexRace_throwsAlreadyParticipant() {
        when(participants.save(any())).thenThrow(new org.springframework.dao.DuplicateKeyException("duplicate"));
        assertThrows(UserAlreadyInRoomException.class,
                () -> service.createParticipant("room", "actor", Role.MEMBER));
    }

    @Test
    void addParticipant_directRoom_throwsForbiddenWithoutReservingSeat() {
        actor(Role.OWNER);
        room.setType(RoomType.DIRECT_MESSAGE);
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(room));
        lenient().when(users.findById("target")).thenReturn(Optional.of(User.builder().id("target").build()));
        lenient().when(rooms.reserveSeat(eq("room"), any())).thenReturn(1L);
        ForbiddenActionException failure = assertThrows(ForbiddenActionException.class,
                () -> service.addParticipant("room", "actor", "target", "MEMBER"));
        assertEquals(com.lnt.chatmee.exception.ErrorCode.FORBIDDEN_ACTION, failure.getErrorCode());
        verify(rooms, never()).reserveSeat(any(), any());
        verify(participants, never()).save(any());
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

    private void actor(Role role) {
        joinUser();
        when(participants.findByChatRoomIdAndUserId("room", "actor"))
                .thenReturn(Optional.of(Participant.builder().role(role).build()));
    }

    private void allowAssignment(Role actorRole, String requestedRole, Role expectedRole) {
        actor(actorRole);
        targetAndRoom("target");
        service.addParticipant("room", "actor", "target", requestedRole);
        verify(participants).save(argThat(p -> p.getUserId().equals("target") && p.getRole() == expectedRole));
        verify(rooms).reserveSeat(eq("room"), any());
    }

    private void rejectAssignment(Role actorRole, String requestedRole) {
        actor(actorRole);
        assertThrows(ForbiddenActionException.class,
                () -> service.addParticipant("room", "actor", "target", requestedRole));
        verifyNoInteractions(rooms);
        verify(participants, never()).save(any());
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
}
