package com.lnt.chatmee.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lnt.chatmee.support.ContainersConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class ActuatorSecurityIT {
    @Autowired private MockMvc mvc;

    @Test
    void health_anonymousRequest_returnsOk() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void env_anonymousRequest_doesNotReturnOk() throws Exception {
        mvc.perform(get("/actuator/env")).andExpect(status().is3xxRedirection());
    }

    @Test
    void env_authenticatedRequest_doesNotReturnOk() throws Exception {
        mvc.perform(get("/actuator/env").with(
                org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login()))
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(result.getResponse().getStatus()).isNotEqualTo(200));
    }
}