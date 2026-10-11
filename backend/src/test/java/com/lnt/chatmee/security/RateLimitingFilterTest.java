package com.lnt.chatmee.security;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import com.lnt.chatmee.service.RateLimitingService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class RateLimitingFilterTest {

    private final ObjectMapper mapper = JsonMapper.builder()
            .addMixIn(org.springframework.http.ProblemDetail.class,
                    org.springframework.http.converter.json.ProblemDetailJacksonMixin.class).build();
    private final RateLimitingService limit = mock(RateLimitingService.class);
    private final RateLimitingFilter filter = new RateLimitingFilter(mapper, limit);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/actuator/health", "/actuator/health/liveness",
            "/oauth2/authorization/google", "/login/oauth2/code/github"})
    void filter_loginAndHealthPaths_skipRateLimit(String path) throws Exception {
        var request = new MockHttpServletRequest("GET", path);
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verifyNoInteractions(limit);
        verify(chain).doFilter(request, response);
        assertThat(response.getHeader("X-RateLimit-Limit")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/auth/me", "/api/v1/auth/status/extra", "/oauth2/other", "/login", "/actuator/info"})
    void filter_otherPaths_areRateLimited(String path) throws Exception {
        when(limit.check(anyString(), anyBoolean())).thenReturn(new RateLimitingService.Decision(true, 20, 19, 60));

        filter.doFilter(new MockHttpServletRequest("GET", path), new MockHttpServletResponse(), mock(FilterChain.class));

        verify(limit).check(anyString(), anyBoolean());
    }

    @Test
    void filter_exceededLimit_returns429ProblemWithoutContinuing() throws Exception {
        when(limit.check(anyString(), anyBoolean())).thenReturn(new RateLimitingService.Decision(false, 20, 0, 42));
        var request = new MockHttpServletRequest("GET", "/api/v1/users");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getContentType()).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        assertThat(response.getHeader("Retry-After")).isEqualTo("42");
        assertThat(response.getHeader("X-RateLimit-Limit")).isEqualTo("20");
        assertThat(response.getHeader("X-RateLimit-Remaining")).isEqualTo("0");
        var body = mapper.readTree(response.getContentAsString());
        assertThat(body.path("code").asString()).isEqualTo("RATE_LIMITED");
        assertThat(body.path("status").asInt()).isEqualTo(429);
        assertThat(body.path("errors").isArray()).isTrue();
        assertThat(body.path("instance").asString()).isEqualTo("/api/v1/users");
        assertThat(body.path("type").asString()).isNotBlank();
        assertThat(body.path("title").asString()).isNotBlank();
        assertThat(body.path("detail").asString()).isEqualTo("Too many requests");
        verifyNoInteractions(chain);
    }

    @Test
    void filter_underLimit_setsHeadersAndContinues() throws Exception {
        when(limit.check(anyString(), anyBoolean())).thenReturn(new RateLimitingService.Decision(true, 20, 7, 30));
        var request = new MockHttpServletRequest("GET", "/api/v1/users");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getHeader("X-RateLimit-Limit")).isEqualTo("20");
        assertThat(response.getHeader("X-RateLimit-Remaining")).isEqualTo("7");
        assertThat(response.getHeader("Retry-After")).isNull();
        verify(chain).doFilter(request, response);
    }

    @Test
    void filter_spoofedForwardedFor_keysOnRemoteAddress() throws Exception {
        when(limit.check(anyString(), anyBoolean())).thenReturn(new RateLimitingService.Decision(true, 20, 19, 60));

        for (String forged : new String[] {"1.1.1.1", "2.2.2.2, 10.0.0.1", "8.8.8.8"}) {
            var request = new MockHttpServletRequest("GET", "/api/v1/users");
            request.setRemoteAddr("203.0.113.9");
            request.addHeader("X-Forwarded-For", forged);
            filter.doFilter(request, new MockHttpServletResponse(), mock(FilterChain.class));
        }

        verify(limit, times(3)).check("ip:203.0.113.9", false);
    }

    @Test
    void filter_authenticatedUser_keysOnUserName() throws Exception {
        when(limit.check(anyString(), anyBoolean())).thenReturn(new RateLimitingService.Decision(true, 100, 99, 60));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("alice", null, AuthorityUtils.createAuthorityList("ROLE_USER")));

        filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/users"), new MockHttpServletResponse(), mock(FilterChain.class));

        verify(limit).check("user:alice", true);
    }
}
