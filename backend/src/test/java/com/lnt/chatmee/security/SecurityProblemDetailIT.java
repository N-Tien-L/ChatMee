package com.lnt.chatmee.security;

import com.lnt.chatmee.support.ContainersConfig;
import jakarta.servlet.Filter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.access.ExceptionTranslationFilter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class SecurityProblemDetailIT {
    @Autowired private MockMvc mvc;
    @Autowired private FilterChainProxy springSecurityFilterChain;

    @Test
    void api_anonymousRequest_returns401ProblemWithoutRedirect() throws Exception {
        mvc.perform(get("/api/v1/users"))
                .andExpect(status().isUnauthorized()).andExpect(header().doesNotExist("Location"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401)).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.type").isNotEmpty()).andExpect(jsonPath("$.title").isNotEmpty())
                .andExpect(jsonPath("$.detail").value("Authentication required"))
                .andExpect(jsonPath("$.instance").value("/api/v1/users")).andExpect(jsonPath("$.errors").isArray());
    }

    @Test
    void api_authenticatedFilterDenial_returns403Problem() throws Exception {
        // Exercise the configured filter handler with a denial after ExceptionTranslationFilter.
        var filters = springSecurityFilterChain.getFilterChains().get(0).getFilters();
        int index = 0;
        while (!(filters.get(index) instanceof ExceptionTranslationFilter)) index++;
        Filter denial = (request, response, chain) -> { throw new AccessDeniedException("Test denial"); };
        filters.add(index + 1, denial);
        try {
            mvc.perform(get("/api/v1/users").with(oauth2Login()))
                    .andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(403)).andExpect(jsonPath("$.code").value("FORBIDDEN_ACTION"))
                    .andExpect(jsonPath("$.type").isNotEmpty()).andExpect(jsonPath("$.title").isNotEmpty())
                    .andExpect(jsonPath("$.detail").value("Access denied"))
                    .andExpect(jsonPath("$.instance").value("/api/v1/users")).andExpect(jsonPath("$.errors").isArray());
        } finally { filters.remove(denial); }
    }

    @Test
    void login_anonymousBrowserRequest_keepsRedirect() throws Exception {
        mvc.perform(get("/login/private")).andExpect(status().is3xxRedirection());
    }
}
