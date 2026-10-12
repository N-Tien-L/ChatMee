package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.lnt.chatmee.dto.response.BlockedUserResponse;
import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.GlobalExceptionHandler;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.service.BlockService;
import com.lnt.chatmee.service.UserService;

@WebMvcTest(UserApiController.class)
@ActiveProfiles("actuator-test")
@ContextConfiguration(classes = {com.lnt.chatmee.config.CurrentUserWebMvcConfig.class, com.lnt.chatmee.security.CurrentUserArgumentResolver.class, UserApiController.class, GlobalExceptionHandler.class})
class UserApiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserService userService;

    @MockitoBean
    private BlockService blockService;

    @Test
    void searchUsers_authenticated_returnsNoEmail() throws Exception {
        UserSummaryResponse user1 = UserSummaryResponse.builder().id("1").name("User1").avatarUrl("av1").build();
        when(userService.searchUsers(anyString(), any(), anyInt(), anyInt())).thenReturn(new PageImpl<>(List.of(user1), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/v1/users")
                .param("query", "User")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value("1"))
                .andExpect(jsonPath("$.data.content[0].name").value("User1"))
                .andExpect(jsonPath("$.data.content[0].email").doesNotExist());
    }

    @Test
    void searchUsers_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/users"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void providerEndpoint_returns404() throws Exception {
        mockMvc.perform(get("/api/v1/users/provider/google/id/123")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getUserById_notFound_returns404() throws Exception {
        when(userService.getUserSummary("99")).thenThrow(new UserNotFoundException("User not found"));

        mockMvc.perform(get("/api/v1/users/99")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .with(csrf()))
                .andExpect(status().isNotFound());
    }

    // CM-073 AC1: block endpoints act on the caller's own blocks, idempotent; self 400; unknown 404 (AC-009-15)

    @Test
    void blockUser_twice_returns204BothTimesWithCallerAsBlocker() throws Exception {
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(put("/api/v1/users/u2/block")
                    .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                    .with(csrf()))
                    .andExpect(status().isNoContent());
        }

        verify(blockService, times(2)).block("u1", "u2");
    }

    @Test
    void blockUser_self_returns400() throws Exception {
        doThrow(new InvalidRequestException("You cannot block yourself")).when(blockService).block("u1", "u1");

        mockMvc.perform(put("/api/v1/users/u1/block")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ARGUMENT"));
    }

    @Test
    void blockUser_unknownUser_returns404() throws Exception {
        doThrow(new UserNotFoundException("User not found")).when(blockService).block("u1", "ghost");

        mockMvc.perform(put("/api/v1/users/ghost/block")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void blockUser_unauthenticated_returns401WithoutBlocking() throws Exception {
        mockMvc.perform(put("/api/v1/users/u2/block").with(csrf()))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(blockService);
    }

    @Test
    void unblockUser_twice_returns204BothTimes() throws Exception {
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(delete("/api/v1/users/u2/block")
                    .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                    .with(csrf()))
                    .andExpect(status().isNoContent());
        }

        verify(blockService, times(2)).unblock("u1", "u2");
    }

    @Test
    void unblockUser_unknownUser_returns404() throws Exception {
        doThrow(new UserNotFoundException("User not found")).when(blockService).unblock("u1", "ghost");

        mockMvc.perform(delete("/api/v1/users/ghost/block")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void listBlocks_caller_returnsOwnBlocksWithIsoTimestamp() throws Exception {
        when(blockService.listBlocks("u1")).thenReturn(List.of(
                new BlockedUserResponse("u2", "Bob", "b.png", Instant.parse("2026-10-12T10:00:00Z"))));

        mockMvc.perform(get("/api/v1/users/me/blocks")
                .with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))
                .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value("u2"))
                .andExpect(jsonPath("$.data[0].name").value("Bob"))
                .andExpect(jsonPath("$.data[0].avatarUrl").value("b.png"))
                .andExpect(jsonPath("$.data[0].blockedAt").value("2026-10-12T10:00:00Z"));
    }
}
