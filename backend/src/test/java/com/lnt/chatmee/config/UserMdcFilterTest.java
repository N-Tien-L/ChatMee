package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

class UserMdcFilterTest {

    private final UserMdcFilter filter = new UserMdcFilter();

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
        MDC.clear();
    }

    @Test
    void doFilter_authenticatedUser_putsUserIdForTheChain() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated("user-1", null, List.of()));
        AtomicReference<String> seen = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                (req, res) -> seen.set(MDC.get("userId")));

        assertThat(seen.get()).isEqualTo("user-1");
        assertThat(MDC.get("userId")).isNull();
    }

    @Test
    void doFilter_anonymousUser_leavesUserIdUnset() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken(
                "key", "anonymousUser", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));
        AtomicReference<String> seen = new AtomicReference<>("unset");

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                (req, res) -> seen.set(MDC.get("userId")));

        assertThat(seen.get()).isNull();
    }

    @Test
    void doFilter_noAuthentication_leavesUserIdUnset() throws Exception {
        AtomicReference<String> seen = new AtomicReference<>("unset");

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                (req, res) -> seen.set(MDC.get("userId")));

        assertThat(seen.get()).isNull();
    }
}
