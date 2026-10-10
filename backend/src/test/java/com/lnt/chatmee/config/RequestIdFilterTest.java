package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.ServletException;

class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void doFilter_withoutHeader_generatesUuidAndEchoesIt() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> seen = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), response, (req, res) -> seen.set(MDC.get("requestId")));

        assertThat(seen.get()).isNotBlank();
        assertThatCode(() -> UUID.fromString(seen.get())).doesNotThrowAnyException();
        assertThat(response.getHeader("X-Request-Id")).isEqualTo(seen.get());
    }

    @Test
    void doFilter_withSafeHeader_reusesIncomingId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "edge-7f3a.42_x");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> seen = new AtomicReference<>();

        filter.doFilter(request, response, (req, res) -> seen.set(MDC.get("requestId")));

        assertThat(seen.get()).isEqualTo("edge-7f3a.42_x");
        assertThat(response.getHeader("X-Request-Id")).isEqualTo("edge-7f3a.42_x");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "abc\r\n2026-10-09 ERROR forged line",
            "has space",
            "\"quoted\"",
            "<script>",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 65 characters
    })
    void doFilter_withUnsafeHeader_generatesNewId(String incoming) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", incoming);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> seen = new AtomicReference<>();

        filter.doFilter(request, response, (req, res) -> seen.set(MDC.get("requestId")));

        assertThat(seen.get()).isNotEqualTo(incoming);
        assertThatCode(() -> UUID.fromString(seen.get())).doesNotThrowAnyException();
        assertThat(response.getHeader("X-Request-Id")).isEqualTo(seen.get());
    }

    @Test
    void doFilter_afterChain_removesRequestIdFromMdc() throws Exception {
        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), (req, res) -> { });

        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    void doFilter_chainThrows_stillRemovesRequestIdFromMdc() {
        assertThatThrownBy(() -> filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                (req, res) -> {
                    throw new ServletException("boom");
                }))
                .isInstanceOf(ServletException.class);

        assertThat(MDC.get("requestId")).isNull();
    }
}
