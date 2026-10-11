package com.lnt.chatmee.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.lnt.chatmee.support.ContainersConfig;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class RateLimitingIT {

    @Autowired
    private MockMvc mvc;

    @Test
    void anonymousRequest_freshClient_isCountedExactlyOnce() throws Exception {
        // A fresh key starts at zero, so a request counted twice (servlet + security chain) would leave 18.
        mvc.perform(get("/api/v1/rooms").with(remoteAddr(uniqueClient())))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("X-RateLimit-Limit", "20"))
                .andExpect(header().string("X-RateLimit-Remaining", "19"));
    }

    @Test
    void oauthLoginRedirect_moreRequestsThanAnonymousLimitFromOneProxyAddress_neverReturns429() throws Exception {
        // Behind the Vercel rewrite every anonymous visitor shares the proxy's address.
        String sharedProxy = uniqueClient();
        for (int i = 0; i < 25; i++) {
            mvc.perform(get("/oauth2/authorization/google").with(remoteAddr(sharedProxy)))
                    .andExpect(status().is3xxRedirection())
                    .andExpect(header().doesNotExist("X-RateLimit-Limit"));
        }
    }

    @Test
    void health_moreRequestsThanAnonymousLimitFromOneProxyAddress_neverReturns429() throws Exception {
        String sharedProxy = uniqueClient();
        for (int i = 0; i < 25; i++) {
            mvc.perform(get("/actuator/health").with(remoteAddr(sharedProxy)))
                    .andExpect(status().isOk())
                    .andExpect(header().doesNotExist("X-RateLimit-Limit"));
        }
    }

    @Test
    void health_anonymous_isNotRateLimited() throws Exception {
        mvc.perform(get("/actuator/health").with(remoteAddr(uniqueClient())))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("X-RateLimit-Limit"));
    }

    private static String uniqueClient() {
        return "client-" + UUID.randomUUID();
    }

    private static RequestPostProcessor remoteAddr(String address) {
        return request -> {
            request.setRemoteAddr(address);
            return request;
        };
    }
}
