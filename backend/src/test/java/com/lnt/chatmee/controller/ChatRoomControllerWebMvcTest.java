package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.PublicRoomSummary;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvalidRequestException;
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

    private static final String CREATE = "/api/v1/rooms";

    @MockitoBean ChatRoomService chatRoomService;
    @MockitoBean ParticipantService participantService;

    @Test
    void discoverRooms_authenticated_returnsPublicRoomsPage() throws Exception {
        PublicRoomSummary room = new PublicRoomSummary("room-1", "General", "Chat", 3, 10, null);
        when(chatRoomService.discoverRooms("u1", "gen", 1, 5))
                .thenReturn(new PageImpl<>(List.of(room), PageRequest.of(1, 5), 6));

        mvc.perform(get("/api/v1/rooms/discover").param("query", "gen").param("page", "1").param("size", "5")
                        .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value("room-1"))
                .andExpect(jsonPath("$.data.content[0].name").value("General"))
                .andExpect(jsonPath("$.data.content[0].memberCount").value(3))
                .andExpect(jsonPath("$.data.content[0].maxMembers").value(10))
                .andExpect(jsonPath("$.data.content[0].participants").doesNotExist())
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.totalElements").value(6))
                .andExpect(jsonPath("$.data.totalPages").value(2));
    }

    @Test
    void discoverRooms_unauthenticated_returns401() throws Exception {
        mvc.perform(get("/api/v1/rooms/discover")).andExpect(status().isUnauthorized());
        verifyNoInteractions(chatRoomService);
    }

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

    // Jackson 2 bound JSON null to false for primitive booleans; Boot 4 keeps that via
    // spring.jackson.deserialization.fail-on-null-for-primitives=false (Jackson 3 default is to fail).
    @Test
    void createRoom_nullSettingFlags_bindsFalse() throws Exception {
        when(chatRoomService.createRoom(any(), eq("u1"))).thenReturn(ChatRoomResponse.builder().id("room-1").build());

        mvc.perform(post(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"roomType":"PUBLIC","roomName":"General","settings":{"allowFileSharing":null,
                                 "allowGuestUsers":null,"moderationRequired":null,"welcomeMessage":"hi"}}"""))
                .andExpect(status().isCreated());

        var request = org.mockito.ArgumentCaptor.forClass(com.lnt.chatmee.dto.request.CreateChatRoomRequest.class);
        org.mockito.Mockito.verify(chatRoomService).createRoom(request.capture(), eq("u1"));
        ChatRoom.RoomSettings settings = request.getValue().getSettings();
        org.assertj.core.api.Assertions.assertThat(settings.isAllowFileSharing()).isFalse();
        org.assertj.core.api.Assertions.assertThat(settings.isAllowGuestUsers()).isFalse();
        org.assertj.core.api.Assertions.assertThat(settings.isModerationRequired()).isFalse();
        org.assertj.core.api.Assertions.assertThat(settings.getWelcomeMessage()).isEqualTo("hi");
    }

    // Jackson 2 ignored content after the first JSON value; kept via spring.jackson.deserialization.fail-on-trailing-tokens=false.
    @Test
    void createRoom_trailingContentAfterJson_isAccepted() throws Exception {
        when(chatRoomService.createRoom(any(), eq("u1"))).thenReturn(ChatRoomResponse.builder().id("room-1").build());

        mvc.perform(post(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"roomType\":\"PUBLIC\",\"roomName\":\"General\"} trailing"))
                .andExpect(status().isCreated());
        org.mockito.Mockito.verify(chatRoomService).createRoom(any(), eq("u1"));
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
        when(chatRoomService.toResponses(rooms, "u1")).thenReturn(List.of(ChatRoomResponse.builder().id("room-1").build()));

        mvc.perform(get("/api/v1/rooms").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value("room-1"));
    }

    @Test
    void getRoom_nonMember_returns404Problem() throws Exception {
        when(chatRoomService.getChatRoomById("u1", "room-1"))
                .thenThrow(new ChatRoomNotFoundException("Can't find chat room with id: room-1 or user is not a participant"));

        expectProblem(mvc.perform(get("/api/v1/rooms/room-1").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))), 404, "ROOM_NOT_FOUND");
    }

    @Test
    void updateRoom_nullSettingFlags_bindsFalse() throws Exception {
        mvc.perform(put("/api/v1/rooms/room-1").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"settings":{"allowFileSharing":null,"allowGuestUsers":null,"moderationRequired":null}}"""))
                .andExpect(status().isOk());

        var request = org.mockito.ArgumentCaptor.forClass(com.lnt.chatmee.dto.request.UpdateChatRoomRequest.class);
        org.mockito.Mockito.verify(chatRoomService).updateChatRoomById(eq("u1"), eq("room-1"), request.capture());
        ChatRoom.RoomSettings settings = request.getValue().getSettings();
        org.assertj.core.api.Assertions.assertThat(settings.isAllowFileSharing()).isFalse();
        org.assertj.core.api.Assertions.assertThat(settings.isAllowGuestUsers()).isFalse();
        org.assertj.core.api.Assertions.assertThat(settings.isModerationRequired()).isFalse();
    }

    @Test
    void updateRoom_maxUsersBelowMinimum_returns400ValidationProblem() throws Exception {
        expectProblem(mvc.perform(put("/api/v1/rooms/room-1").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                .contentType(MediaType.APPLICATION_JSON).content("{\"maxUsers\":1}")), 400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'maxUsers')]").isNotEmpty());
        verifyNoInteractions(chatRoomService);
    }

    @Test
    void deleteRoom_nonCreator_returns403Problem() throws Exception {
        doThrow(new UnauthorizedRoomActionException("Only room creator can delete the room"))
                .when(chatRoomService).deleteChatRoomById("u1", "room-1");

        expectProblem(mvc.perform(delete("/api/v1/rooms/room-1").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                403, "FORBIDDEN_ACTION");
    }

    @Test
    void joinRoom_privateRoom_returns403Problem() throws Exception {
        doThrow(new ForbiddenActionException("Only PUBLIC rooms can be joined"))
                .when(participantService).joinRoom("room-1", "u1");

        expectProblem(mvc.perform(post("/api/v1/rooms/room-1/members/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                403, "FORBIDDEN_ACTION");
    }

    @Test
    void joinRoom_alreadyMember_returns409Problem() throws Exception {
        doThrow(new UserAlreadyInRoomException("User is already in the room"))
                .when(participantService).joinRoom("room-1", "u1");

        expectProblem(mvc.perform(post("/api/v1/rooms/room-1/members/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                409, "ALREADY_PARTICIPANT");
    }

    @Test
    void joinRoom_fullRoom_returns409Problem() throws Exception {
        doThrow(new RoomCapacityExceededException("Room has reached maximum capacity"))
                .when(participantService).joinRoom("room-1", "u1");

        expectProblem(mvc.perform(post("/api/v1/rooms/room-1/members/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                409, "ROOM_FULL");
    }

    @Test
    void addParticipant_directAddRemoved_returns405WithoutAddingMember() throws Exception {
        // AC-009-5: members enter a PRIVATE room only by accepting an invitation.
        mvc.perform(post("/api/v1/rooms/room-1/members").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                .contentType(MediaType.APPLICATION_JSON).content("{\"userId\":\"u2\",\"role\":\"MEMBER\"}"))
                .andExpect(status().isMethodNotAllowed());
        verifyNoInteractions(participantService);
    }

    @Test
    void leaveRoom_member_returns200() throws Exception {
        mvc.perform(delete("/api/v1/rooms/room-1/members/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void createRoom_existingDirectMessage_returns200WithExistingRoom() throws Exception {
        when(chatRoomService.findExistingDirectRoom(any(), eq("u1"))).thenReturn(java.util.Optional.of(
                ChatRoomResponse.builder().id("dm-1").roomType(RoomType.DIRECT_MESSAGE).participants(Set.of("u1", "u2")).build()));

        mvc.perform(post(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"roomType\":\"DIRECT_MESSAGE\",\"participantId\":\"u2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value("dm-1"));
        org.mockito.Mockito.verify(chatRoomService, org.mockito.Mockito.never()).createRoom(any(), any());
    }

    @Test
    void markRead_nonMember_returns404() throws Exception {
        doThrow(new ChatRoomNotFoundException("Room membership not found"))
            .when(participantService).markRead("room-1", "u1");
        mvc.perform(put("/api/v1/rooms/room-1/members/me/read")
            .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader()))
            .andExpect(status().isNotFound());
    }

    @Test
    void markRead_member_usesPrincipalAndReturns204() throws Exception {
        mvc.perform(put("/api/v1/rooms/room-1/members/me/read")
            .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader()))
            .andExpect(status().isNoContent());
        org.mockito.Mockito.verify(participantService).markRead("room-1", "u1");
    }

    @Test
    void getRooms_activityOrder_includesSummaryUnreadAndMyRole() throws Exception {
        var now = java.time.Instant.parse("2026-10-12T10:00:00Z");
        var rows = List.of(ChatRoom.builder().id("new").build(), ChatRoom.builder().id("old").build());
        when(chatRoomService.getList("u1")).thenReturn(rows);
        when(chatRoomService.toResponses(rows, "u1")).thenReturn(List.of(
            ChatRoomResponse.builder().id("new").lastActivityAt(now).unreadCount(2)
                .lastMessage(new com.lnt.chatmee.dto.event.LastMessageSummary("m1", "u2", "Bob", "hello", now))
                .myRole(com.lnt.chatmee.model.Participant.Role.ADMIN).build(),
            ChatRoomResponse.builder().id("old").myRole(com.lnt.chatmee.model.Participant.Role.MEMBER).build()));
        mvc.perform(get(CREATE).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].id").value("new"))
            .andExpect(jsonPath("$.data[1].id").value("old"))
            .andExpect(jsonPath("$.data[0].myRole").value("ADMIN"))
            .andExpect(jsonPath("$.data[0].unreadCount").value(2))
            .andExpect(jsonPath("$.data[0].lastActivityAt").value(now.toString()))
            .andExpect(jsonPath("$.data[0].lastMessage.preview").value("hello"));
    }


    @Test
    void getMembers_member_returnsMemberContractUsingPrincipal() throws Exception {
        when(participantService.getMembers("room-1", "u1")).thenReturn(List.of(
            new com.lnt.chatmee.dto.response.MemberResponse("u2", "Bob", "avatar", com.lnt.chatmee.model.Participant.Role.ADMIN)));
        mvc.perform(get("/api/v1/rooms/room-1/members")
            .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].id").value("u2"))
            .andExpect(jsonPath("$.data[0].name").value("Bob"))
            .andExpect(jsonPath("$.data[0].avatarUrl").value("avatar"))
            .andExpect(jsonPath("$.data[0].role").value("ADMIN"));
        org.mockito.Mockito.verify(participantService).getMembers("room-1", "u1");
    }

    @Test
    void getMembers_nonMember_returns404() throws Exception {
        when(participantService.getMembers("room-1", "u1")).thenThrow(new ChatRoomNotFoundException("Room membership not found"));
        mvc.perform(get("/api/v1/rooms/room-1/members")
            .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
            .andExpect(status().isNotFound());
    }

    // CM-075 AC2: hide is DM-only; DELETE on a DM is forbidden (AC-009-21, AC-009-22)

    @Test
    void hideRoom_directMessage_returns204ForCaller() throws Exception {
        mvc.perform(post("/api/v1/rooms/dm-1/hide")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader()))
            .andExpect(status().isNoContent());
        verify(chatRoomService).hideRoom("u1", "dm-1");
    }

    @Test
    void hideRoom_groupRoom_returns400Problem() throws Exception {
        doThrow(new InvalidRequestException("Only direct messages can be hidden"))
                .when(chatRoomService).hideRoom("u1", "room-1");

        expectProblem(mvc.perform(post("/api/v1/rooms/room-1/hide")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                400, "INVALID_ARGUMENT");
    }

    @Test
    void hideRoom_nonMember_returns404Problem() throws Exception {
        doThrow(new ChatRoomNotFoundException("Can't find chat room with id: dm-1 or user is not a participant"))
                .when(chatRoomService).hideRoom("u1", "dm-1");

        expectProblem(mvc.perform(post("/api/v1/rooms/dm-1/hide")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                404, "ROOM_NOT_FOUND");
    }

    @Test
    void deleteRoom_directMessage_returns403UseHideProblem() throws Exception {
        doThrow(new ForbiddenActionException("Use hide for direct messages"))
                .when(chatRoomService).deleteChatRoomById("u1", "dm-1");

        expectProblem(mvc.perform(delete("/api/v1/rooms/dm-1")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader())),
                403, "FORBIDDEN_ACTION")
            .andExpect(jsonPath("$.detail").value("Use hide for direct messages"));
    }
}
