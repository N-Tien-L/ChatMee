package com.lnt.chatmee.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfigurationSource;

import com.lnt.chatmee.config.CsrfCookieFilter;
import com.lnt.chatmee.config.OAuth2AuthenticationSuccessHandler;
import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.config.SpaCsrfTokenRequestHandler;
import com.lnt.chatmee.controller.AuthApiController;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.CustomOAuth2UserService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.Cookie;

@WebMvcTest(
    controllers = AuthApiController.class,
    properties = "app.client.url=http://localhost"
)
@ActiveProfiles("actuator-test")
@Import({SecurityConfig.class, SpaCsrfTokenRequestHandler.class, CsrfCookieFilter.class})
class CsrfSecurityTest {

    @Autowired MockMvc mvc;

    @MockitoBean CustomOAuth2UserService customOAuth2UserService;
    @MockitoBean(name = "corsConfigurationSource") CorsConfigurationSource corsConfigurationSource;
    @MockitoBean OAuth2AuthenticationSuccessHandler successHandler;
    @MockitoBean RateLimitingFilter rateLimitingFilter;
    @MockitoBean WsTokenService wsTokenService;
    @MockitoBean UserRepository userRepository;
    @MockitoBean ClientRegistrationRepository clientRegistrationRepository;
    @MockitoBean com.lnt.chatmee.util.OAuthUtil oauthUtil;

    @BeforeEach
    void passThroughRateLimiter() throws Exception {
        doAnswer(invocation -> {
            FilterChain chain = invocation.getArgument(2);
            chain.doFilter(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(rateLimitingFilter).doFilter(any(ServletRequest.class), any(ServletResponse.class), any(FilterChain.class));
    }

    @Test
    void postWithoutCsrf_returnsForbidden() throws Exception {
        mvc.perform(post("/api/v1/auth/ws-token").with(oauth2Login()))
                .andExpect(status().isForbidden());
    }

    @Test
    void postWithCsrfMethod_returnsOk() throws Exception {
        mvc.perform(post("/api/v1/auth/ws-token").with(oauth2Login()).with(csrf()))
                .andExpect(status().isOk());
    }

    @Test
    void postWithSpaToken_returnsOk() throws Exception {
        mvc.perform(post("/api/v1/auth/ws-token")
                .with(oauth2Login())
                .cookie(new Cookie("XSRF-TOKEN", "test-token"))
                .header("X-XSRF-TOKEN", "test-token"))
                .andExpect(status().isOk());
    }

    @Test
    void postToWsWithoutCsrf_notForbiddenByCsrf() throws Exception {
        // CSRF ignores /ws/**.
        mvc.perform(post("/ws/anything").with(oauth2Login()))
                .andExpect(status().isNotFound()); // or other non-403 status, but not 403 by CSRF
    }

    @Test
    void getLogout_doesNotLogout() throws Exception {
        mvc.perform(get("/logout").with(oauth2Login()))
                .andExpect(status().isNotFound()); // GET /logout is not handled by default logout config anymore
    }

    @Test
    void postLogout_redirects() throws Exception {
        mvc.perform(post("/logout").with(oauth2Login()).with(csrf()))
                .andExpect(status().isFound());
    }
}
