package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.exception.GlobalExceptionHandler;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.service.UserService;

@WebMvcTest(UserApiController.class)
@ActiveProfiles("actuator-test")
@ContextConfiguration(classes = {UserApiController.class, GlobalExceptionHandler.class})
class UserApiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserService userService;

    @Test
    void searchUsers_authenticated_returnsNoEmail() throws Exception {
        UserSummaryResponse user1 = UserSummaryResponse.builder().id("1").name("User1").avatarUrl("av1").build();
        when(userService.searchUsers(anyString(), any(), anyInt(), anyInt())).thenReturn(new PageImpl<>(List.of(user1), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/v1/users")
                .param("query", "User")
                .with(oauth2Login())
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
                .with(oauth2Login())
                .with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getUserById_notFound_returns404() throws Exception {
        when(userService.getUserSummary("99")).thenThrow(new UserNotFoundException("User not found"));

        mockMvc.perform(get("/api/v1/users/99")
                .with(oauth2Login())
                .with(csrf()))
                .andExpect(status().isNotFound());
    }
}
