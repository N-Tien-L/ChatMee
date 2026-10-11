package com.lnt.chatmee.controller;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.response.MessagePageResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.model.Message.MessageType;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.MessageService;
import com.lnt.chatmee.support.SecuredWebMvcTestSupport;

@WebMvcTest(controllers = MessageController.class, properties = "app.client.url=http://localhost:3000")
@ActiveProfiles("actuator-test")
@Import(SecurityConfig.class)
class MessageControllerWebMvcTest extends SecuredWebMvcTestSupport {

    private static final String HISTORY = "/api/v1/rooms/room-1/messages";

    @MockitoBean MessageService messageService;
    @MockitoBean UserRepository userRepository;

    @Test
    void getRecentMessages_member_returnsMessagesWithIsoTimestamps() throws Exception {
        when(messageService.getMessages("room-1", "u1", null, 50)).thenReturn(new MessagePageResponse(List.of(ChatMessageResponse.builder()
                .id("m1").chatRoomId("room-1").senderId("u2").content("hi").type(MessageType.TEXT)
                .createdAt(Instant.parse("2026-10-09T01:02:03Z")).updatedAt(Instant.parse("2026-10-09T01:02:03Z"))
                .build()), null, false));

        mvc.perform(get(HISTORY).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messages[0].id").value("m1"))
                .andExpect(jsonPath("$.data.messages[0].createdAt").value("2026-10-09T01:02:03Z"))
                .andExpect(jsonPath("$.data.messages[0].isDeleted").value(false))
                .andExpect(jsonPath("$.data.nextCursor").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.hasMore").value(false));
    }

    @Test
    void getMessages_noCursor_returnsNewestPageWithNextCursor() throws Exception {
        String cursor = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("1791507723000:m1".getBytes(StandardCharsets.UTF_8));
        when(messageService.getMessages("room-1", "u1", null, 50)).thenReturn(new MessagePageResponse(
                List.of(ChatMessageResponse.builder().id("m1").build(),
                        ChatMessageResponse.builder().id("m2").build()), cursor, true));

        mvc.perform(get(HISTORY).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messages[0].id").value("m1"))
                .andExpect(jsonPath("$.data.messages[1].id").value("m2"))
                .andExpect(jsonPath("$.data.nextCursor").value(cursor))
                .andExpect(jsonPath("$.data.hasMore").value(true));
        org.mockito.Mockito.verify(messageService).getMessages("room-1", "u1", null, 50);
    }

    @Test
    void getMessages_malformedCursor_returns400Problem() throws Exception {
        when(messageService.getMessages("room-1", "u1", "not-a-cursor", 50))
                .thenThrow(new com.lnt.chatmee.exception.InvalidRequestException("Malformed message cursor"));

        expectProblem(mvc.perform(get(HISTORY).param("before", "not-a-cursor")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))),
                400, "VALIDATION_FAILED");
    }

    @Test
    void getMessages_beforeAndLimit_forwardsCursorAndLimitToService() throws Exception {
        when(messageService.getMessages("room-1", "u1", "cursor", 7))
                .thenReturn(new MessagePageResponse(List.of(), null, false));
        mvc.perform(get(HISTORY).param("before", "cursor").param("limit", "7")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messages").isEmpty());
        org.mockito.Mockito.verify(messageService).getMessages("room-1", "u1", "cursor", 7);
    }

    @Test
    void getRecentMessages_nonMember_returns403Problem() throws Exception {
        when(messageService.getMessages("room-1", "u1", null, 50))
                .thenThrow(new ForbiddenActionException("You are not a participant of this room"));

        expectProblem(mvc.perform(get(HISTORY).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))), 403, "FORBIDDEN_ACTION");
    }

    @Test
    void getRecentMessages_unknownRoom_returns404Problem() throws Exception {
        when(messageService.getMessages("room-1", "u1", null, 50))
                .thenThrow(new ChatRoomNotFoundException("Chat room not found: room-1"));

        expectProblem(mvc.perform(get(HISTORY).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))), 404, "ROOM_NOT_FOUND");
    }

    @Test
    void getRecentMessages_callerWithoutAccount_returns404Problem() throws Exception {
        when(messageService.getMessages("room-1", "u1", null, 50)).thenThrow(new com.lnt.chatmee.exception.UserNotFoundException("Authenticated user not found"));

        expectProblem(mvc.perform(get(HISTORY).with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))), 404, "USER_NOT_FOUND");
        org.mockito.Mockito.verify(messageService).getMessages("room-1", "u1", null, 50);
    }

    @Test
    void getRecentMessages_unauthenticated_returns401Problem() throws Exception {
        expectProblem(mvc.perform(get(HISTORY)), 401, "UNAUTHENTICATED");
        verifyNoInteractions(messageService);
    }

}
