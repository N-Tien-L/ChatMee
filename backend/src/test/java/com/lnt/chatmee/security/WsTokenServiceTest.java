package com.lnt.chatmee.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.Duration;
import java.util.Base64;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfigurationSource;

import com.lnt.chatmee.config.OAuth2AuthenticationSuccessHandler;
import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.controller.AuthApiController;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.CustomOAuth2UserService;
import com.lnt.chatmee.util.OAuthUtil;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

class WsTokenServiceTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final UserRepository users = mock(UserRepository.class);
    private final OAuthUtil oauth = mock(OAuthUtil.class);
    private final OAuth2User principal = mock(OAuth2User.class);
    private final WsTokenService tokens = new WsTokenService(redis, users, oauth);

    @BeforeEach
    void setUp() {
        when(redis.opsForValue()).thenReturn(values);
    }

    @Test
    void issueToken_authenticatedUser_storesInternalIdWithSixtySecondTtl() {
        when(oauth.determineProvider(principal)).thenReturn("google");
        when(oauth.getProviderId(principal, "google")).thenReturn("provider-id");
        when(users.findByProviderAndProviderId("google", "provider-id"))
                .thenReturn(Optional.of(User.builder().id("internal-user").build()));
        String token = tokens.issueToken(principal);
        assertTrue(Base64.getUrlDecoder().decode(token).length >= 16);
        assertTrue(token.matches("[A-Za-z0-9_-]+"));
        verify(values).set("ws-token:" + token, "internal-user", Duration.ofSeconds(60));
        String secondToken = tokens.issueToken(principal);
        assertNotEquals(token, secondToken);
    }

    @Test
    void consumeToken_existingToken_usesAtomicGetAndDelete() {
        when(values.getAndDelete("ws-token:token")).thenReturn("internal-user").thenReturn(null);
        assertEquals("internal-user", tokens.consumeToken("token"));
        assertNull(tokens.consumeToken("token"));
        verify(values, times(2)).getAndDelete("ws-token:token");
        verifyNoMoreInteractions(values);
    }

    @Test
    void issueToken_missingPrincipal_rejectsWithoutWritingToken() {
        assertThrows(BadCredentialsException.class, () -> tokens.issueToken(null));
        verifyNoInteractions(values, users, oauth);
    }

    @Test
    void issueToken_unknownUser_rejectsWithoutWritingToken() {
        when(oauth.determineProvider(principal)).thenReturn("google");
        when(oauth.getProviderId(principal, "google")).thenReturn("missing");
        when(users.findByProviderAndProviderId("google", "missing")).thenReturn(Optional.empty());
        assertThrows(BadCredentialsException.class, () -> tokens.issueToken(principal));
        verifyNoInteractions(values);
    }

    @Nested
    @SpringBootTest(classes = {SecurityConfig.class, AuthApiController.class},
            properties = "app.client.url=http://localhost")
    @ActiveProfiles("actuator-test")
    @AutoConfigureMockMvc
    @ImportAutoConfiguration({WebMvcAutoConfiguration.class, JacksonAutoConfiguration.class,
            SecurityAutoConfiguration.class})
    class TokenEndpoint {
        @Autowired
        private MockMvc mvc;
        @MockitoBean
        private WsTokenService endpointTokens;
        @MockitoBean
        private UserRepository endpointUsers;
        @MockitoBean
        private OAuthUtil endpointOauth;
        @MockitoBean
        private CustomOAuth2UserService customOAuth2UserService;
        @MockitoBean(name = "corsConfigurationSource")
        private CorsConfigurationSource corsConfigurationSource;
        @MockitoBean
        private OAuth2AuthenticationSuccessHandler successHandler;
        @MockitoBean
        private RateLimitingFilter rateLimiter;
        @MockitoBean
        private ClientRegistrationRepository clientRegistrationRepository;

        @BeforeEach
        void passThroughRateLimiter() throws Exception {
            doAnswer(invocation -> {
                FilterChain chain = invocation.getArgument(2);
                chain.doFilter(invocation.getArgument(0), invocation.getArgument(1));
                return null;
            }).when(rateLimiter).doFilter(any(ServletRequest.class), any(ServletResponse.class), any(FilterChain.class));
        }

        @Test
        void getWsToken_unauthenticatedSession_doesNotIssueToken() throws Exception {
            mvc.perform(post("/api/v1/auth/ws-token"))
                    .andExpect(status().isUnauthorized());
            verifyNoInteractions(endpointTokens);
        }

        @Test
        void getWsToken_authenticatedSession_returnsUncachedToken() throws Exception {
            when(endpointTokens.issueToken(any(OAuth2User.class))).thenReturn("issued-token");
            mvc.perform(post("/api/v1/auth/ws-token").with(oauth2Login()))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.token").value("issued-token"));
            verify(endpointTokens).issueToken(any(OAuth2User.class));
            verifyNoInteractions(endpointUsers, endpointOauth);
        }
    }
}
