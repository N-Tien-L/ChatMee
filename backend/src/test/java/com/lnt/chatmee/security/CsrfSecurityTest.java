package com.lnt.chatmee.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;


import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfigurationSource;

import com.lnt.chatmee.config.OAuth2AuthenticationSuccessHandler;
import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.controller.AuthApiController;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.CustomOAuth2UserService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Cookie;

@WebMvcTest(
    controllers = AuthApiController.class,
    properties = "app.client.url=http://localhost"
)
@ActiveProfiles("actuator-test")
@Import({SecurityConfig.class, com.lnt.chatmee.config.CurrentUserWebMvcConfig.class, CurrentUserArgumentResolver.class})
class CsrfSecurityTest {

    @Autowired MockMvc mvc;

    @MockitoBean CustomOAuth2UserService customOAuth2UserService;
    @MockitoBean(name = "corsConfigurationSource") CorsConfigurationSource corsConfigurationSource;
    @MockitoBean OAuth2AuthenticationSuccessHandler successHandler;
    @MockitoBean RateLimitingFilter rateLimitingFilter;
    @MockitoBean WsTokenService wsTokenService;
    @MockitoBean UserRepository userRepository;
    @MockitoBean ClientRegistrationRepository clientRegistrationRepository;
    @MockitoBean com.lnt.chatmee.service.UserService userService;

    private OAuth2AuthenticationToken authToken;

    @BeforeEach
    void setup() throws Exception {
        doAnswer(invocation -> {
            FilterChain chain = invocation.getArgument(2);
            chain.doFilter(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(rateLimitingFilter).doFilterInternal(any(HttpServletRequest.class), any(HttpServletResponse.class), any(FilterChain.class));
        
        when(wsTokenService.issueToken(any())).thenReturn("mock-token");

        OAuth2User principal = com.lnt.chatmee.support.TestUsers.principal("u1");
        authToken = new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "github");
    }

    @Test
    void postWithoutCsrf_returnsForbidden() throws Exception {
        mvc.perform(post("/api/v1/auth/ws-token").with(authentication(authToken)))
                .andExpect(status().isForbidden());
    }

    @Test
    void postWithSpaToken_returnsOk() throws Exception {
        mvc.perform(post("/api/v1/auth/ws-token")
                .with(authentication(authToken))
                .cookie(new Cookie("XSRF-TOKEN", "spa-token-123"))
                .header("X-XSRF-TOKEN", "spa-token-123"))
                .andExpect(status().isOk());
    }

    @Test
    void postWithMismatchedSpaToken_returnsForbidden() throws Exception {
        mvc.perform(post("/api/v1/auth/ws-token")
                .with(authentication(authToken))
                .cookie(new Cookie("XSRF-TOKEN", "a"))
                .header("X-XSRF-TOKEN", "b"))
                .andExpect(status().isForbidden());
    }

    @Test
    void getRequest_issuesXsrfCookie() throws Exception {
        mvc.perform(get("/actuator/info")
                .with(authentication(authToken)))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie().exists("XSRF-TOKEN"));
    }

    @Test
    void postToWsWithoutCsrf_notForbiddenByCsrf() throws Exception {
        // CSRF ignores /ws/**.
        mvc.perform(post("/ws/anything").with(authentication(authToken)))
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(result.getResponse().getStatus()).isNotEqualTo(403));
    }

    @Test
    void getLogout_doesNotLogout() throws Exception {
        mvc.perform(get("/logout").with(authentication(authToken)))
                .andExpect(status().isOk()); // GET /logout is not handled by default logout config anymore
    }

    @Test
    void postLogout_redirects() throws Exception {
        mvc.perform(post("/logout")
                .with(authentication(authToken))
                .cookie(new Cookie("XSRF-TOKEN", "spa-token-123"))
                .header("X-XSRF-TOKEN", "spa-token-123"))
                .andExpect(status().isFound());
    }
}
