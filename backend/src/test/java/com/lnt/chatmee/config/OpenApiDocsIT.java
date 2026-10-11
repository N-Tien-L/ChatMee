package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lnt.chatmee.support.ContainersConfig;

@SpringBootTest(properties = { "springdoc.api-docs.enabled=true", "springdoc.swagger-ui.enabled=true" })
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class OpenApiDocsIT {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void apiDocs_authenticated_listsEveryRestEndpoint() throws Exception {
        JsonNode paths = apiDocs().path("paths");

        assertThat(paths.fieldNames()).toIterable().contains(
                "/api/v1/auth/ws-token", "/api/v1/auth/me",
                "/api/v1/rooms", "/api/v1/rooms/{roomId}",
                "/api/v1/rooms/{roomId}/members", "/api/v1/rooms/{roomId}/members/me",
                "/api/v1/rooms/{roomId}/messages", "/api/v1/online-users",
                "/api/v1/users", "/api/v1/users/{userId}");
    }

    @Test
    void apiDocs_authenticated_documentsProblemDetailErrors() throws Exception {
        JsonNode docs = apiDocs();
        JsonNode createResponses = docs.at("/paths/~1api~1v1~1rooms/post/responses");

        for (String status : List.of("400", "401", "403", "404", "409", "429", "500")) {
            assertThat(createResponses.at("/" + status + "/content/application~1problem+json/schema/$ref").asText())
                    .as("response %s", status)
                    .isEqualTo("#/components/schemas/" + OpenApiConfig.PROBLEM_SCHEMA);
        }
        JsonNode problem = docs.at("/components/schemas/" + OpenApiConfig.PROBLEM_SCHEMA + "/properties");
        assertThat(problem.fieldNames()).toIterable().contains("type", "title", "status", "detail", "code", "errors");
    }

    @Test
    void apiDocs_unauthenticated_redirectsToLogin() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().is3xxRedirection());
    }

    @Test
    void swaggerUi_authenticated_isServed() throws Exception {
        mvc.perform(get("/swagger-ui/index.html").with(oauth2Login())).andExpect(status().isOk());
    }

    private JsonNode apiDocs() throws Exception {
        String body = mvc.perform(get("/v3/api-docs").with(oauth2Login()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }
}
