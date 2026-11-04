package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.security.WsTokenService;
import com.lnt.chatmee.support.SecuredWebMvcTestSupport;

@WebMvcTest(controllers = AuthApiController.class, properties = "app.client.url=http://localhost:3000")
@ActiveProfiles("actuator-test")
@Import({SecurityConfig.class, com.lnt.chatmee.service.UserService.class})
class AuthControllerWebMvcTest extends SecuredWebMvcTestSupport {

    @MockitoBean UserRepository userRepository;
    @MockitoBean WsTokenService wsTokenService;
    @MockitoBean com.lnt.chatmee.service.BlockService blockService;

    @Test
    void getCurrentUser_knownUser_returnsOwnProfile() throws Exception {
        when(userRepository.findById("u1")).thenReturn(Optional.of(
                User.builder().id("u1").name("Alice").email("alice@example.com").provider(PROVIDER).build()));

        mvc.perform(get("/api/v1/auth/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.authenticated").value(true))
                .andExpect(jsonPath("$.data.user.id").value("u1"))
                .andExpect(jsonPath("$.data.user.email").value("alice@example.com"));
    }

    @Test
    void getCurrentUser_userMissingFromDatabase_returns404Problem() throws Exception {
        when(userRepository.findById("u1")).thenReturn(Optional.empty());

        expectProblem(mvc.perform(get("/api/v1/auth/me").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))), 404, "USER_NOT_FOUND");
    }

    @Test
    void getCurrentUser_unauthenticated_returns401ProblemWithoutRedirect() throws Exception {
        expectProblem(mvc.perform(get("/api/v1/auth/me")), 401, "UNAUTHENTICATED");
        verifyNoInteractions(userRepository);
    }

    @Test
    void getAuthStatus_removed_anonymousReturns401Problem() throws Exception {
        // CM-042 (A-4): /api/v1/auth/status was removed in favour of /api/v1/auth/me.
        expectProblem(mvc.perform(get("/api/v1/auth/status")), 401, "UNAUTHENTICATED");
    }

    @Test
    void getAuthStatus_removed_authenticatedReturns404() throws Exception {
        mvc.perform(get("/api/v1/auth/status").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void getWsToken_authenticatedWithCsrf_returnsUncachedToken() throws Exception {
        when(wsTokenService.issueToken(any(), any())).thenReturn("token-123");

        mvc.perform(post("/api/v1/auth/ws-token").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.token").value("token-123"));
    }

    @Test
    void getWsToken_missingCsrfToken_returns403Problem() throws Exception {
        expectProblem(mvc.perform(post("/api/v1/auth/ws-token").with(oauth2Login().oauth2User(com.lnt.chatmee.support.TestUsers.principal("u1")))), 403, "FORBIDDEN_ACTION");
        verifyNoInteractions(wsTokenService);
    }

    @Test
    void getWsToken_unauthenticated_returns401Problem() throws Exception {
        expectProblem(mvc.perform(post("/api/v1/auth/ws-token").with(csrf().asHeader())), 401, "UNAUTHENTICATED");
        verifyNoInteractions(wsTokenService);
    }
}
