package com.lnt.chatmee.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lnt.chatmee.service.RateLimitingService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RateLimitingFilterTest {
    @Test
    void filter_exceededLimit_returns429ProblemWithoutContinuing() throws Exception {
        var mapper = new ObjectMapper().findAndRegisterModules()
                .addMixIn(org.springframework.http.ProblemDetail.class,
                        org.springframework.http.converter.json.ProblemDetailJacksonMixin.class);
        var limit = mock(RateLimitingService.class);
        var filter = new RateLimitingFilter(mapper, limit);
        var request = new MockHttpServletRequest("GET", "/api/v1/users");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);
        filter.doFilter(request, response, chain);
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getContentType()).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        var body = mapper.readTree(response.getContentAsString());
        assertThat(body.path("code").asText()).isEqualTo("RATE_LIMITED");
        assertThat(body.path("status").asInt()).isEqualTo(429);
        assertThat(body.path("errors").isArray()).isTrue();
        assertThat(body.path("instance").asText()).isEqualTo("/api/v1/users");
        assertThat(body.path("type").asText()).isNotBlank();
        assertThat(body.path("title").asText()).isNotBlank();
        assertThat(body.path("detail").asText()).isEqualTo("Too many requests");
        verifyNoInteractions(chain);
    }
}
