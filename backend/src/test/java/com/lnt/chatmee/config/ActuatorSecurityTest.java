package com.lnt.chatmee.config;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.autoconfigure.endpoint.EndpointAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.endpoint.web.WebEndpointAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.env.EnvironmentEndpointAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.health.HealthEndpointAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.info.InfoEndpointAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.web.server.ManagementContextAutoConfiguration;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfigurationSource;

import com.lnt.chatmee.security.RateLimitingFilter;
import com.lnt.chatmee.service.CustomOAuth2UserService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

// Load the real security chain and Actuator mappings without application scanning
// or database/cache auto-configuration. Exposure still comes from application.properties.
@SpringBootTest(classes = SecurityConfig.class, properties = "app.client.url=http://localhost")
@ActiveProfiles("actuator-test")
@AutoConfigureMockMvc
@ImportAutoConfiguration({
        WebMvcAutoConfiguration.class, JacksonAutoConfiguration.class,
        SecurityAutoConfiguration.class, EndpointAutoConfiguration.class,
        WebEndpointAutoConfiguration.class, ManagementContextAutoConfiguration.class,
        HealthEndpointAutoConfiguration.class, InfoEndpointAutoConfiguration.class,
        EnvironmentEndpointAutoConfiguration.class
})
class ActuatorSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CustomOAuth2UserService customOAuth2UserService;
    @MockitoBean(name = "corsConfigurationSource")
    private CorsConfigurationSource corsConfigurationSource;
    @MockitoBean
    private OAuth2AuthenticationSuccessHandler successHandler;
    @MockitoBean
    private RateLimitingFilter rateLimitingFilter;
    @MockitoBean
    private ClientRegistrationRepository clientRegistrationRepository;

    @BeforeEach
    void passThroughRateLimiter() throws Exception {
        doAnswer(invocation -> {
            FilterChain chain = invocation.getArgument(2);
            chain.doFilter(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(rateLimitingFilter).doFilter(any(ServletRequest.class), any(ServletResponse.class), any(FilterChain.class));
    }

    @Test
    void healthIsPublic() throws Exception {
        mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void infoIsPublic() throws Exception {
        mockMvc.perform(get("/actuator/info")).andExpect(status().isOk());
    }

    @Test
    void envIsNotExposedEvenToAuthenticatedUsers() throws Exception {
        mockMvc.perform(get("/actuator/env").with(user("actuator-test")))
                .andExpect(status().isNotFound());
    }

    @Test
    void envRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/actuator/env")).andExpect(status().is3xxRedirection());
    }

    @Test
    void otherActuatorPathsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/actuator/metrics")).andExpect(status().is3xxRedirection());
    }
}
