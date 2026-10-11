package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.messaging.support.AbstractSubscribableChannel;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.lnt.chatmee.support.ContainersConfig;

import jakarta.servlet.Filter;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class RequestCorrelationIT {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private FilterChainProxy filterChainProxy;

    @Autowired
    @Qualifier("clientInboundChannel")
    private AbstractSubscribableChannel clientInboundChannel;

    @Test
    void anyRequest_withoutRequestId_returnsGeneratedRequestIdHeader() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Request-Id", matchesPattern("[0-9a-f-]{36}")));
    }

    @Test
    void anyRequest_withSafeRequestId_echoesIt() throws Exception {
        mvc.perform(get("/actuator/health").header("X-Request-Id", "trace-123"))
                .andExpect(header().string("X-Request-Id", "trace-123"));
    }

    @Test
    void unauthenticatedApiRequest_stillReturnsRequestIdHeader() throws Exception {
        mvc.perform(get("/api/v1/rooms"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().exists("X-Request-Id"));
    }

    @Test
    void securityFilterChain_tagsUserAfterContextIsLoadedAndBeforeAuthorization() {
        List<Filter> filters = filterChainProxy.getFilters("/api/v1/rooms");

        int contextIndex = indexOf(filters, SecurityContextHolderFilter.class);
        int userMdcIndex = indexOf(filters, UserMdcFilter.class);
        int authorizationIndex = indexOf(filters, AuthorizationFilter.class);

        assertThat(contextIndex).isNotNegative();
        assertThat(userMdcIndex).isGreaterThan(contextIndex).isLessThan(authorizationIndex);
    }

    @Test
    void clientInboundChannel_registersStompMdcInterceptor() {
        assertThat(clientInboundChannel.getInterceptors()).hasAtLeastOneElementOfType(StompMdcInterceptor.class);
    }

    private static int indexOf(List<Filter> filters, Class<? extends Filter> type) {
        for (int i = 0; i < filters.size(); i++) {
            if (type.isInstance(filters.get(i))) {
                return i;
            }
        }
        return -1;
    }
}
