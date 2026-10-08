package com.lnt.chatmee.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.HashSet;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.lnt.chatmee.exception.ForbiddenActionException;
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
    @InjectMocks ParticipantService service;
    private ChatRoom room;

    @BeforeEach
    void setUp() {
        room = ChatRoom.builder().id("room").type(RoomType.PUBLIC)
                .participants(new HashSet<>()).maxParticipants(10).build();
    }

    @Test
    void joinRoom_publicRoom_addsMember() {
        joinUser();
        targetAndRoom("actor");
        service.joinRoom("room", "google", "subject");
        verify(participants).save(argThat(p -> p.getUserId().equals("actor") && p.getRole() == Role.MEMBER));
        assertTrue(room.getParticipants().contains("actor"));
        verify(rooms).save(room);
    }

    @Test
    void joinRoom_privateRoom_throwsForbidden() { rejectJoin(RoomType.PRIVATE); }

    @Test
    void joinRoom_directMessageRoom_throwsForbidden() { rejectJoin(RoomType.DIRECT_MESSAGE); }

    @Test
    void joinRoom_existingPublicMember_throwsAlreadyParticipant() {
        joinUser();
        targetAndRoom("actor");
        when(participants.existsByChatRoomIdAndUserId("room", "actor")).thenReturn(true);
        UserAlreadyInRoomException failure = assertThrows(UserAlreadyInRoomException.class,
                () -> service.joinRoom("room", "google", "subject"));
        assertEquals("User is already in the room", failure.getMessage());
        verify(participants, never()).save(any());
        verify(rooms, never()).save(any());
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
                () -> service.addParticipant("room", "google", "subject", "target", "MEMBER"));
        verifyNoInteractions(rooms);
        verify(participants, never()).save(any());
    }

    @Test
    void addParticipant_invalidRole_throwsBadRequestException() {
        actor(Role.OWNER);
        assertThrows(com.lnt.chatmee.exception.InvalidRequestException.class,
                () -> service.addParticipant("room", "google", "subject", "target", "INVALID"));
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

    private void actor(Role role) {
        joinUser();
        when(participants.findByChatRoomIdAndUserId("room", "actor"))
                .thenReturn(Optional.of(Participant.builder().role(role).build()));
    }

    private void allowAssignment(Role actorRole, String requestedRole, Role expectedRole) {
        actor(actorRole);
        targetAndRoom("target");
        service.addParticipant("room", "google", "subject", "target", requestedRole);
        verify(participants).save(argThat(p -> p.getUserId().equals("target") && p.getRole() == expectedRole));
        assertTrue(room.getParticipants().contains("target"));
        verify(rooms).save(room);
    }

    private void rejectAssignment(Role actorRole, String requestedRole) {
        actor(actorRole);
        assertThrows(ForbiddenActionException.class,
                () -> service.addParticipant("room", "google", "subject", "target", requestedRole));
        verifyNoInteractions(rooms);
        verify(participants, never()).save(any());
    }

    private void rejectJoin(RoomType type) {
        room.setType(type);
        joinUser();
        when(rooms.findById("room")).thenReturn(Optional.of(room));
        assertThrows(ForbiddenActionException.class, () -> service.joinRoom("room", "google", "subject"));
        verify(participants, never()).save(any());
        verify(rooms, never()).save(any());
    }

    private void joinUser() {
        when(users.findByProviderAndProviderId("google", "subject"))
                .thenReturn(Optional.of(User.builder().id("actor").build()));
    }

    private void targetAndRoom(String userId) {
        when(rooms.findById("room")).thenReturn(Optional.of(room));
        when(users.findById(userId)).thenReturn(Optional.of(User.builder().id(userId).build()));
    }
}
