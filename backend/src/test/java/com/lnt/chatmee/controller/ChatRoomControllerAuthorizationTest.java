package com.lnt.chatmee.controller;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
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
import com.lnt.chatmee.util.OAuthUtil;

@WebMvcTest(ChatRoomController.class)
@ActiveProfiles("actuator-test")
@ContextConfiguration(classes = {ChatRoomController.class, GlobalExceptionHandler.class})
@Import(ParticipantService.class)
class ChatRoomControllerAuthorizationTest {
    @Autowired MockMvc mvc;
    @MockitoBean ChatRoomService chatRooms;
    @MockitoBean ChatRoomRepository rooms;
    @MockitoBean UserRepository users;
    @MockitoBean ParticipantRepository participants;
    @MockitoBean OAuthUtil oauth;

    @BeforeEach
    void setUp() {
        when(oauth.determineProvider(any())).thenReturn("google");
        when(oauth.getProviderId(any(), eq("google"))).thenReturn("subject");
        when(users.findByProviderAndProviderId("google", "subject"))
                .thenReturn(Optional.of(User.builder().id("actor").build()));
        lenient().when(rooms.reserveSeat(any(), any())).thenReturn(1L);
    }

    @Test
    void joinRoom_privateRoom_returnsForbidden() throws Exception {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.PRIVATE).isActive(true).build()));
        mvc.perform(post("/api/v1/chatrooms/room/join").with(oauth2Login()).with(csrf()))
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
    void joinRoom_publicRoom_returnsOk() throws Exception {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.PUBLIC).isActive(true).build()));
        when(users.findById("actor")).thenReturn(Optional.of(User.builder().id("actor").build()));
        mvc.perform(post("/api/v1/chatrooms/room/join").with(oauth2Login()).with(csrf()))
                .andExpect(status().isOk());
        verify(participants).save(argThat(p -> p.getUserId().equals("actor") && p.getRole() == Role.MEMBER));
    }

    @Test
    void joinRoom_directMessageRoom_returnsForbidden() throws Exception {
        when(rooms.findByIdAndIsActiveTrue("room")).thenReturn(Optional.of(ChatRoom.builder()
                .id("room").type(RoomType.DIRECT_MESSAGE).isActive(true).build()));
        mvc.perform(post("/api/v1/chatrooms/room/join").with(oauth2Login()).with(csrf()))
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
        mvc.perform(post("/api/v1/chatrooms/room/add-participant").with(oauth2Login()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"target\",\"role\":\"" + role + "\"}"))
                .andExpect(status().is(expectedStatus));
    }
}
