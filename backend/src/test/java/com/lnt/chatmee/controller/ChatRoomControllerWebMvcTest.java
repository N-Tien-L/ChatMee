package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.support.SecuredWebMvcTestSupport;

@WebMvcTest(controllers = ChatRoomController.class, properties = "app.client.url=http://localhost:3000")
@ActiveProfiles("actuator-test")
@Import(SecurityConfig.class)
class ChatRoomControllerWebMvcTest extends SecuredWebMvcTestSupport {

    private static final String CREATE = "/api/v1/chatrooms/create";

    @MockitoBean ChatRoomService chatRoomService;
    @MockitoBean ParticipantService participantService;

    @Test
    void createRoom_validPublicRoom_returns201WithRoom() throws Exception {
        when(chatRoomService.createRoom(any(), eq("u1"))).thenReturn(ChatRoomResponse.builder()
                .id("room-1").roomName("General").roomType(RoomType.PUBLIC).participants(Set.of("u1")).build());

        mvc.perform(post(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"roomType\":\"PUBLIC\",\"roomName\":\"General\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value("room-1"))
                .andExpect(jsonPath("$.data.participants[0]").value("u1"));
    }

    @Test
    void createRoom_missingTypeAndBadName_returns400ValidationProblem() throws Exception {
        expectProblem(mvc.perform(post(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"roomName\":\"bad!\"}")),
                400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'roomType')]").isNotEmpty())
                .andExpect(jsonPath("$.errors[?(@.field == 'roomName')]").isNotEmpty());
        verifyNoInteractions(chatRoomService);
    }

    @Test
    void createRoom_malformedJson_returns400Problem() throws Exception {
        expectProblem(mvc.perform(post(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                .contentType(MediaType.APPLICATION_JSON).content("{")), 400, "INVALID_ARGUMENT");
    }

    @Test
    void createRoom_unauthenticated_returns401ProblemWithoutRedirect() throws Exception {
        expectProblem(mvc.perform(post(CREATE).with(csrf().asHeader())
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomType\":\"PUBLIC\",\"roomName\":\"General\"}")),
                401, "UNAUTHENTICATED");
        verifyNoInteractions(chatRoomService);
    }

    @Test
    void createRoom_missingCsrfToken_returns403Problem() throws Exception {
        expectProblem(mvc.perform(post(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomType\":\"PUBLIC\",\"roomName\":\"General\"}")),
                403, "FORBIDDEN_ACTION");
        verifyNoInteractions(chatRoomService);
    }

    @Test
    void listRooms_authenticated_returnsCallerRooms() throws Exception {
        List<ChatRoom> rooms = List.of(ChatRoom.builder().id("room-1").build());
        when(chatRoomService.getList("u1")).thenReturn(rooms);
        when(chatRoomService.toResponses(rooms)).thenReturn(List.of(ChatRoomResponse.builder().id("room-1").build()));

        mvc.perform(get("/api/v1/chatrooms").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value("room-1"));
    }

    @Test
    void getRoom_nonMember_returns404Problem() throws Exception {
        when(chatRoomService.getChatRoomById("u1", "room-1"))
                .thenThrow(new ChatRoomNotFoundException("Can't find chat room with id: room-1 or user is not a participant"));

        expectProblem(mvc.perform(get("/api/v1/chatrooms/room-1").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))), 404, "ROOM_NOT_FOUND");
    }

    @Test
    void updateRoom_maxUsersBelowMinimum_returns400ValidationProblem() throws Exception {
        expectProblem(mvc.perform(put("/api/v1/chatrooms/room-1").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                .contentType(MediaType.APPLICATION_JSON).content("{\"maxUsers\":1}")), 400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'maxUsers')]").isNotEmpty());
        verifyNoInteractions(chatRoomService);
    }

    @Test
    void deleteRoom_nonCreator_returns403Problem() throws Exception {
        doThrow(new UnauthorizedRoomActionException("Only room creator can delete the room"))
                .when(chatRoomService).deleteChatRoomById("u1", "room-1");

        expectProblem(mvc.perform(delete("/api/v1/chatrooms/room-1").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                403, "FORBIDDEN_ACTION");
    }

    @Test
    void joinRoom_privateRoom_returns403Problem() throws Exception {
        doThrow(new ForbiddenActionException("Only PUBLIC rooms can be joined"))
                .when(participantService).joinRoom("room-1", "u1");

        expectProblem(mvc.perform(post("/api/v1/chatrooms/room-1/join").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                403, "FORBIDDEN_ACTION");
    }

    @Test
    void joinRoom_alreadyMember_returns409Problem() throws Exception {
        doThrow(new UserAlreadyInRoomException("User is already in the room"))
                .when(participantService).joinRoom("room-1", "u1");

        expectProblem(mvc.perform(post("/api/v1/chatrooms/room-1/join").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                409, "ALREADY_PARTICIPANT");
    }

    @Test
    void joinRoom_fullRoom_returns409Problem() throws Exception {
        doThrow(new RoomCapacityExceededException("Room has reached maximum capacity"))
                .when(participantService).joinRoom("room-1", "u1");

        expectProblem(mvc.perform(post("/api/v1/chatrooms/room-1/join").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                409, "ROOM_FULL");
    }

    @Test
    void addParticipant_missingUserId_returns400ValidationProblem() throws Exception {
        expectProblem(mvc.perform(post("/api/v1/chatrooms/room-1/add-participant").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                .contentType(MediaType.APPLICATION_JSON).content("{}")), 400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'userId')]").isNotEmpty());
        verifyNoInteractions(participantService);
    }

    @Test
    void leaveRoom_member_returns200() throws Exception {
        mvc.perform(post("/api/v1/chatrooms/room-1/leave").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }
}
