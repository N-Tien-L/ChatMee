package com.lnt.chatmee.controller;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.lnt.chatmee.exception.GlobalExceptionHandler;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.service.policy.*;

@WebMvcTest(ChatRoomController.class)
@ActiveProfiles("actuator-test")
@ContextConfiguration(classes = {com.lnt.chatmee.config.CurrentUserWebMvcConfig.class, com.lnt.chatmee.security.CurrentUserArgumentResolver.class, ChatRoomController.class, GlobalExceptionHandler.class})
@Import({ParticipantService.class, RoomTypePolicyRegistry.class, PublicRoomPolicy.class,
        PrivateRoomPolicy.class, DirectRoomPolicy.class})
class ChatRoomControllerAuthorizationTest {
    @Autowired MockMvc mvc;
    @MockitoBean ChatRoomService chatRooms;
    @MockitoBean com.lnt.chatmee.service.MessageService messageService;
    @MockitoBean com.lnt.chatmee.service.UserEventPublisher userEvents;
    @MockitoBean ChatRoomRepository rooms;
    @MockitoBean UserRepository users;
    @MockitoBean ParticipantRepository participants;
    @MockitoBean com.lnt.chatmee.repository.MessageRepository messageRepository;

    @BeforeEach
    void setUp() {
        when(users.findById("actor"))
                .thenReturn(Optional.of(User.builder().id("actor").build()));
        lenient().when(rooms.reserveSeat(any(), any())).thenReturn(1L);
    }

    @Test
    void joinRoom_privateRoom_returnsForbidden() throws Exception {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.PRIVATE).isActive(true).build()));
        mvc.perform(post("/api/v1/rooms/room/members/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("actor"))).with(csrf()))
                .andExpect(status().isForbidden());
        verify(participants, never()).save(any());
        verify(rooms, never()).save(any());
    }

    @Test
    void addParticipant_adminAssigningAdmin_returnsForbidden() throws Exception {
        actor(Role.ADMIN);
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.PRIVATE).isActive(true).build()));
        when(users.findById("target")).thenReturn(Optional.of(User.builder().id("target").build()));
        add("ADMIN", 403);
        verify(participants, never()).save(any());
        verify(rooms, never()).save(any());
    }

    @Test
    void addParticipant_directRoom_returnsForbiddenAction() throws Exception {
        actor(Role.OWNER);
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.DIRECT_MESSAGE).isActive(true).build()));
        mvc.perform(post("/api/v1/rooms/room/members")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("actor"))).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"userId\":\"target\",\"role\":\"MEMBER\"}"))
                .andExpect(status().isForbidden())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code").value("FORBIDDEN_ACTION"));
        verify(participants, never()).save(any());
        verify(rooms, never()).reserveSeat(any(), any());
    }

    @Test
    void addParticipant_invalidRole_returnsBadRequest() throws Exception {
        actor(Role.OWNER);
        add("INVALID", 400);
        verify(participants, never()).save(any());
    }

    @Test
    void addParticipant_nonParticipant_returnsForbidden() throws Exception {
        add("MEMBER", 403);
        verify(participants, never()).save(any());
    }

    @Test
    void joinRoom_publicRoom_returnsNoContent() throws Exception {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.PUBLIC).isActive(true).build()));
        when(users.findById("actor")).thenReturn(Optional.of(User.builder().id("actor").build()));
        mvc.perform(post("/api/v1/rooms/room/members/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("actor"))).with(csrf()))
                .andExpect(status().isNoContent());
        verify(participants).save(argThat(p -> p.getUserId().equals("actor") && p.getRole() == Role.MEMBER));
    }

    @Test
    void joinRoom_directMessageRoom_returnsForbidden() throws Exception {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.DIRECT_MESSAGE).isActive(true).build()));
        mvc.perform(post("/api/v1/rooms/room/members/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("actor"))).with(csrf()))
                .andExpect(status().isForbidden());
        verify(participants, never()).save(any());
        verify(rooms, never()).save(any());
    }

    @Test
    void addParticipant_ownerAssigningAdmin_returnsOk() throws Exception {
        actor(Role.OWNER);
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.PRIVATE).isActive(true).build()));
        when(users.findById("target")).thenReturn(Optional.of(User.builder().id("target").build()));
        add("ADMIN", 200);
        verify(participants).save(argThat(p -> p.getUserId().equals("target") && p.getRole() == Role.ADMIN));
    }

    private void actor(Role role) {
        when(participants.findByChatRoomIdAndUserId("room", "actor"))
                .thenReturn(Optional.of(Participant.builder().role(role).build()));
    }

    private void add(String role, int expectedStatus) throws Exception {
        mvc.perform(post("/api/v1/rooms/room/members").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("actor"))).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"target\",\"role\":\"" + role + "\"}"))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void removeMember_ownerRemovingMember_returns204() throws Exception { remove(Role.OWNER, Role.MEMBER, RoomType.PUBLIC, "target", 204); }
    @Test
    void removeMember_ownerRemovingAdmin_returns204() throws Exception { remove(Role.OWNER, Role.ADMIN, RoomType.PRIVATE, "target", 204); }
    @Test
    void removeMember_ownerRemovingOwner_returns204() throws Exception { remove(Role.OWNER, Role.OWNER, RoomType.PUBLIC, "target", 204); }
    @Test
    void removeMember_ownerRemovingSelf_returns403() throws Exception { remove(Role.OWNER, Role.OWNER, RoomType.PUBLIC, "actor", 403); }
    @Test
    void removeMember_adminRemovingMember_returns204() throws Exception { remove(Role.ADMIN, Role.MEMBER, RoomType.PUBLIC, "target", 204); }
    @Test
    void removeMember_adminRemovingAdmin_returns403() throws Exception { remove(Role.ADMIN, Role.ADMIN, RoomType.PUBLIC, "target", 403); }
    @Test
    void removeMember_adminRemovingOwner_returns403() throws Exception { remove(Role.ADMIN, Role.OWNER, RoomType.PUBLIC, "target", 403); }
    @Test
    void removeMember_memberRemovingMember_returns403() throws Exception { remove(Role.MEMBER, Role.MEMBER, RoomType.PUBLIC, "target", 403); }
    @Test
    void removeMember_directRoom_returns403() throws Exception { remove(Role.OWNER, Role.MEMBER, RoomType.DIRECT_MESSAGE, "target", 403); }
    @Test
    void removeMember_unknownTarget_returns404() throws Exception { remove(Role.OWNER, null, RoomType.PUBLIC, "target", 404); }
    @Test
    void removeMember_nonMemberCaller_returns404() throws Exception { remove(null, Role.MEMBER, RoomType.PUBLIC, "target", 404); }

    @Test
    void roleChange_ownerPromotesMemberToAdmin_returns204() throws Exception { roleChange(Role.OWNER, Role.MEMBER, RoomType.PUBLIC, "target", "{\"role\":\"ADMIN\"}", 204); }
    @Test
    void roleChange_ownerDemotesAdminToMember_returns204() throws Exception { roleChange(Role.OWNER, Role.ADMIN, RoomType.PRIVATE, "target", "{\"role\":\"MEMBER\"}", 204); }
    @Test
    void roleChange_adminCaller_returns403() throws Exception { roleChange(Role.ADMIN, Role.MEMBER, RoomType.PUBLIC, "target", "{\"role\":\"ADMIN\"}", 403); }
    @Test
    void roleChange_memberCaller_returns403() throws Exception { roleChange(Role.MEMBER, Role.MEMBER, RoomType.PUBLIC, "target", "{\"role\":\"ADMIN\"}", 403); }
    @Test
    void roleChange_ownerTargetingSelf_returns403() throws Exception { roleChange(Role.OWNER, Role.OWNER, RoomType.PUBLIC, "actor", "{\"role\":\"MEMBER\"}", 403); }
    @Test
    void roleChange_targetIsOwner_returns403() throws Exception { roleChange(Role.OWNER, Role.OWNER, RoomType.PUBLIC, "target", "{\"role\":\"MEMBER\"}", 403); }
    @Test
    void roleChange_ownerRoleInBody_returns400() throws Exception { roleChange(Role.OWNER, Role.MEMBER, RoomType.PUBLIC, "target", "{\"role\":\"OWNER\"}", 400); }
    @Test
    void roleChange_unknownRoleValue_returns400() throws Exception { roleChange(Role.OWNER, Role.MEMBER, RoomType.PUBLIC, "target", "{\"role\":\"SUPERUSER\"}", 400); }
    @Test
    void roleChange_directRoom_returns403() throws Exception { roleChange(Role.OWNER, Role.MEMBER, RoomType.DIRECT_MESSAGE, "target", "{\"role\":\"ADMIN\"}", 403); }
    @Test
    void roleChange_unknownTarget_returns404() throws Exception { roleChange(Role.OWNER, null, RoomType.PUBLIC, "target", "{\"role\":\"ADMIN\"}", 404); }
    @Test
    void roleChange_nonMemberCaller_returns404() throws Exception { roleChange(null, Role.MEMBER, RoomType.PUBLIC, "target", "{\"role\":\"ADMIN\"}", 404); }

    private void roleChange(Role actorRole, Role targetRole, RoomType type, String target, String body, int expected) throws Exception {
        // createdBy deliberately names the caller: only the participant role may grant a role change.
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
            .id("room").createdBy("actor").type(type).isActive(true).build()));
        if (actorRole != null) actor(actorRole);
        if (targetRole != null && !target.equals("actor"))
            when(participants.findByChatRoomIdAndUserId("room", target)).thenReturn(Optional.of(Participant.builder().userId(target).role(targetRole).build()));
        if (expected == 204) {
            when(participants.updateRoleIfCurrent("room", target, targetRole, body.contains("ADMIN") ? Role.ADMIN : Role.MEMBER)).thenReturn(1L);
            when(users.findById(target)).thenReturn(Optional.of(User.builder().id(target).name("Target").build()));
        }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/rooms/room/members/" + target + "/role")
            .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("actor"))).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expected));
        if (expected == 204) {
            verify(participants).updateRoleIfCurrent(eq("room"), eq(target), eq(targetRole), any());
            verify(messageService).postSystemMessage(eq("room"), any());
            verify(userEvents).roomUpdated(eq(target), any());
        } else {
            verify(participants, never()).updateRoleIfCurrent(any(), any(), any(), any());
            verify(messageService, never()).postSystemMessage(any(), any());
            verifyNoInteractions(userEvents);
        }
    }

    private void remove(Role actorRole, Role targetRole, RoomType type, String target, int expected) throws Exception {
        // createdBy deliberately differs: the participant role controls authorization.
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
            .id("room").createdBy("former-owner").type(type).isActive(true).build()));
        if (actorRole != null) actor(actorRole);
        if (targetRole != null && !target.equals("actor"))
            when(participants.findByChatRoomIdAndUserId("room", target)).thenReturn(Optional.of(Participant.builder().userId(target).role(targetRole).build()));
        if (expected == 204) {
            when(participants.deleteByChatRoomIdAndUserId("room", target)).thenReturn(1L);
            when(users.findById(target)).thenReturn(Optional.of(User.builder().id(target).name("Target").build()));
        }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/rooms/room/members/" + target)
            .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("actor"))).with(csrf()))
            .andExpect(status().is(expected));
        if (expected == 204) {
            verify(participants).deleteByChatRoomIdAndUserId("room", target);
            verify(rooms).releaseSeat(eq("room"), any());
            verify(userEvents).roomRemoved(java.util.Set.of(target), "room", "REMOVED");
        } else {
            verify(participants, never()).deleteByChatRoomIdAndUserId(any(), any());
            verifyNoInteractions(userEvents);
        }
    }

}
