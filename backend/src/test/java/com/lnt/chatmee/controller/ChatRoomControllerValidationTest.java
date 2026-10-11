package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;

@WebMvcTest(ChatRoomController.class)
@ActiveProfiles("actuator-test")
@org.springframework.test.context.ContextConfiguration(classes = {com.lnt.chatmee.config.CurrentUserWebMvcConfig.class, com.lnt.chatmee.security.CurrentUserArgumentResolver.class, ChatRoomController.class, com.lnt.chatmee.exception.GlobalExceptionHandler.class})
class ChatRoomControllerValidationTest {
    @Autowired MockMvc mvc;
    @MockitoBean ChatRoomService rooms;
    @MockitoBean ParticipantService participants;
    @MockitoBean UserRepository users;
    @MockitoBean ParticipantRepository participantRepository;

    @Test
    void createRoom_zeroMaxUsers_returnsBadRequest() throws Exception {
        reject("PUBLIC", "Room", 0);
    }

    @Test
    void createRoom_oneMaxUser_returnsBadRequest() throws Exception {
        reject("PUBLIC", "Room", 1);
    }

    @Test
    void createRoom_nullRoomType_returnsBadRequest() throws Exception {
        reject(null, "Room", 2);
    }

    @Test
    void createRoom_nameOf101Characters_returnsBadRequest() throws Exception {
        reject("PUBLIC", "x".repeat(101), 2);
    }

    @Test
    void createRoom_nameWithForbiddenCharacters_returnsBadRequest() throws Exception {
        reject("PUBLIC", "bad!", 2);
    }

    @Test
    void createRoom_publicRoomWithoutName_returnsBadRequest() throws Exception {
        rejectJson("{\"roomType\":\"PUBLIC\",\"maxUsers\":2}");
    }

    @Test
    void createRoom_directMessageWithoutParticipant_returnsBadRequest() throws Exception {
        rejectJson("{\"roomType\":\"DIRECT_MESSAGE\"}");
    }

    @Test
    void createRoom_directMessageWithParticipantAndNoName_returnsCreated() throws Exception {
        mvc.perform(post("/api/v1/rooms").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomType\":\"DIRECT_MESSAGE\",\"participantId\":\"user-2\"}"))
                .andExpect(status().isCreated());
        verify(rooms).createRoom(any(), any());
    }

    @Test
    void createRoom_validBoundaryRequest_returnsCreated() throws Exception {
        mvc.perform(post("/api/v1/rooms").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body("PUBLIC", "x".repeat(100), 2)))
                .andExpect(status().isCreated());
        verify(rooms).createRoom(any(), any());
    }

    private void reject(String type, String name, int maxUsers) throws Exception {
        rejectJson(body(type, name, maxUsers));
    }

    private void rejectJson(String json) throws Exception {
        mvc.perform(post("/api/v1/rooms").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(rooms, participants, users, participantRepository);
    }

    private String body(String type, String name, int maxUsers) {
        return "{\"roomType\":" + (type == null ? "null" : "\"" + type + "\"")
                + ",\"roomName\":\"" + name + "\",\"maxUsers\":" + maxUsers + "}";
    }
}
