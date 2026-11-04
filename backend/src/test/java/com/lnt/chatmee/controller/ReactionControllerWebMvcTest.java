package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.dto.response.MessageReactionsResponse;
import com.lnt.chatmee.dto.response.ReactionSummaryResponse;
import com.lnt.chatmee.dto.response.ReactorPageResponse;
import com.lnt.chatmee.dto.response.ReactorResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.ReactionService;
import com.lnt.chatmee.support.SecuredWebMvcTestSupport;
import com.lnt.chatmee.support.TestUsers;

@WebMvcTest(controllers = ReactionController.class, properties = "app.client.url=http://localhost:3000")
@ActiveProfiles("actuator-test")
@Import(SecurityConfig.class)
class ReactionControllerWebMvcTest extends SecuredWebMvcTestSupport {

    private static final String BASE = "/api/v1/rooms/r1/messages/m1";
    private static final String THUMBS = new String(Character.toChars(0x1F44D));

    @MockitoBean ReactionService reactionService;
    @MockitoBean UserRepository userRepository;

    @Test
    void put_member_returnsCallerSummary() throws Exception {
        when(reactionService.react("r1", "m1", "u1", THUMBS)).thenReturn(new MessageReactionsResponse("m1",
                List.of(new ReactionSummaryResponse(THUMBS, 3, true))));

        mvc.perform(put(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"emoji\":\"" + THUMBS + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messageId").value("m1"))
                .andExpect(jsonPath("$.data.reactions[0].emoji").value(THUMBS))
                .andExpect(jsonPath("$.data.reactions[0].count").value(3))
                .andExpect(jsonPath("$.data.reactions[0].reactedByMe").value(true));
    }

    @Test
    void put_identityFromPrincipalNotBody() throws Exception {
        when(reactionService.react("r1", "m1", "u1", THUMBS)).thenReturn(new MessageReactionsResponse("m1", List.of()));

        mvc.perform(put(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emoji\":\"" + THUMBS + "\",\"userId\":\"someone-else\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void put_blankEmoji_400() throws Exception {
        expectProblem(mvc.perform(put(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1")))
                .with(csrf().asHeader()).contentType(MediaType.APPLICATION_JSON).content("{\"emoji\":\"\"}")),
                400, "VALIDATION_FAILED");
        verifyNoInteractions(reactionService);
    }

    @Test
    void react_invalidEmoji_400() throws Exception {
        when(reactionService.react("r1", "m1", "u1", "ok"))
                .thenThrow(new InvalidRequestException("Reaction must be a single emoji"));
        expectProblem(mvc.perform(put(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1")))
                .with(csrf().asHeader()).contentType(MediaType.APPLICATION_JSON).content("{\"emoji\":\"ok\"}")),
                400, "INVALID_ARGUMENT");
    }

    @Test
    void react_nonMember_404() throws Exception {
        when(reactionService.react("r1", "m1", "u1", THUMBS)).thenThrow(new ChatRoomNotFoundException("Message not found"));
        expectProblem(mvc.perform(put(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1")))
                .with(csrf().asHeader()).contentType(MediaType.APPLICATION_JSON).content("{\"emoji\":\"" + THUMBS + "\"}")),
                404, "ROOM_NOT_FOUND");
    }

    @Test
    void react_blockedDm_403() throws Exception {
        when(reactionService.unreact("r1", "m1", "u1")).thenThrow(new ForbiddenActionException("Cannot message this user"));
        expectProblem(mvc.perform(delete(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1")))
                .with(csrf().asHeader())), 403, "FORBIDDEN_ACTION");
    }

    @Test
    void delete_member_returns200() throws Exception {
        when(reactionService.unreact("r1", "m1", "u1")).thenReturn(new MessageReactionsResponse("m1", List.of()));
        mvc.perform(delete(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reactions").isEmpty());
    }

    @Test
    void put_withoutCsrf_isRejected() throws Exception {
        mvc.perform(put(BASE + "/reaction").with(oauth2Login().oauth2User(TestUsers.principal("u1")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"emoji\":\"" + THUMBS + "\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(reactionService);
    }

    @Test
    void anonymous_returns401() throws Exception {
        mvc.perform(get(BASE + "/reactions")).andExpect(status().isUnauthorized());
        verifyNoInteractions(reactionService);
    }

    @Test
    void reactions_list_pagedAndFiltered() throws Exception {
        when(reactionService.listReactors("r1", "m1", "u1", THUMBS, null, 20)).thenReturn(new ReactorPageResponse(
                List.of(new ReactorResponse("u2", "Bob", THUMBS, Instant.parse("2026-11-01T00:00:00Z"))), "next", true));

        mvc.perform(get(BASE + "/reactions").param("emoji", THUMBS)
                        .with(oauth2Login().oauth2User(TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reactions[0].displayName").value("Bob"))
                .andExpect(jsonPath("$.data.reactions[0].createdAt").value("2026-11-01T00:00:00Z"))
                .andExpect(jsonPath("$.data.nextCursor").value("next"))
                .andExpect(jsonPath("$.data.hasMore").value(true));
    }
}
