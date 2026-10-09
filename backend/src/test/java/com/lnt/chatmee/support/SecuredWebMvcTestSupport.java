package com.lnt.chatmee.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.cors.CorsConfigurationSource;

import com.lnt.chatmee.config.OAuth2AuthenticationSuccessHandler;
import com.lnt.chatmee.security.RateLimitingFilter;
import com.lnt.chatmee.service.CustomOAuth2UserService;
import com.lnt.chatmee.util.OAuthUtil;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

/**
 * Base for {@code @WebMvcTest} slices that run the real {@code SecurityConfig} (subclasses add
 * {@code @Import(SecurityConfig.class)}): its collaborators are mocked, the rate limiter passes requests
 * through, and every caller authenticated with {@code oauth2Login()} resolves to provider "github", id "42".
 */
public abstract class SecuredWebMvcTestSupport {

    protected static final String PROVIDER = "github";
    protected static final String PROVIDER_ID = "42";

    @Autowired protected MockMvc mvc;

    @MockitoBean protected OAuthUtil oAuthUtil;
    @MockitoBean protected CustomOAuth2UserService customOAuth2UserService;
    @MockitoBean(name = "corsConfigurationSource") protected CorsConfigurationSource corsConfigurationSource;
    @MockitoBean protected OAuth2AuthenticationSuccessHandler successHandler;
    @MockitoBean protected RateLimitingFilter rateLimitingFilter;
    @MockitoBean protected ClientRegistrationRepository clientRegistrationRepository;

    @BeforeEach
    void passThroughRateLimiterAndResolveCaller() throws Exception {
        doAnswer(invocation -> {
            invocation.<FilterChain>getArgument(2).doFilter(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(rateLimitingFilter).doFilter(any(ServletRequest.class), any(ServletResponse.class), any(FilterChain.class));
        lenient().when(oAuthUtil.determineProvider(any())).thenReturn(PROVIDER);
        lenient().when(oAuthUtil.getProviderId(any(), eq(PROVIDER))).thenReturn(PROVIDER_ID);
    }

    /** Asserts the shared application/problem+json contract of docs/design/error-handling.md. */
    protected static ResultActions expectProblem(ResultActions result, int status, String code) throws Exception {
        result.andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").isNotEmpty())
                .andExpect(jsonPath("$.title").isNotEmpty())
                .andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.detail").isNotEmpty())
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.errors").isArray());
        assertThat(result.andReturn().getResponse().getHeader("Location")).as("no login redirect").isNull();
        return result;
    }
}
