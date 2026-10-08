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
import com.lnt.chatmee.util.OAuthUtil;

@WebMvcTest(ChatRoomController.class)
@ActiveProfiles("actuator-test")
@org.springframework.test.context.ContextConfiguration(classes = {ChatRoomController.class, com.lnt.chatmee.exception.GlobalExceptionHandler.class})
class ChatRoomControllerValidationTest {
    @Autowired MockMvc mvc;
    @MockitoBean ChatRoomService rooms;
    @MockitoBean ParticipantService participants;
    @MockitoBean UserRepository users;
    @MockitoBean ParticipantRepository participantRepository;
    @MockitoBean OAuthUtil oauth;

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
    void createRoom_validBoundaryRequest_returnsCreated() throws Exception {
        mvc.perform(post("/api/v1/chatrooms/create").with(oauth2Login()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body("PUBLIC", "x".repeat(100), 2)))
                .andExpect(status().isCreated());
        verify(rooms).createRoom(any(), any(), any());
    }

    private void reject(String type, String name, int maxUsers) throws Exception {
        mvc.perform(post("/api/v1/chatrooms/create").with(oauth2Login()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(type, name, maxUsers)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(rooms, participants, users, participantRepository, oauth);
    }

    private String body(String type, String name, int maxUsers) {
        return "{\"roomType\":" + (type == null ? "null" : "\"" + type + "\"")
                + ",\"roomName\":\"" + name + "\",\"maxUsers\":" + maxUsers + "}";
    }
}
