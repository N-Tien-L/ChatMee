package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
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

        assertThat(paths.propertyNames()).contains(
                "/api/v1/auth/ws-token", "/api/v1/auth/me",
                "/api/v1/rooms", "/api/v1/rooms/{roomId}",
                "/api/v1/rooms/{roomId}/members", "/api/v1/rooms/{roomId}/members/me",
                "/api/v1/rooms/{roomId}/members/me/read",
                "/api/v1/rooms/{roomId}/members/{userId}",
                "/api/v1/rooms/{roomId}/messages", "/api/v1/online-users",
                "/api/v1/users", "/api/v1/users/{userId}",
                "/api/v1/rooms/{roomId}/invitations", "/api/v1/invitations",
                "/api/v1/invitations/{id}", "/api/v1/invitations/{id}/accept", "/api/v1/invitations/{id}/decline");
        // AC-009-5: direct add is removed; the members collection is read-only.
        assertThat(paths.path("/api/v1/rooms/{roomId}/members").propertyNames()).containsExactly("get");
        assertThat(paths.path("/api/v1/rooms/{roomId}/invitations").propertyNames()).contains("get", "post");
    }

    @Test
    void apiDocs_authenticated_documentsProblemDetailErrors() throws Exception {
        JsonNode docs = apiDocs();
        JsonNode createResponses = docs.at("/paths/~1api~1v1~1rooms/post/responses");

        for (String status : List.of("400", "401", "403", "404", "409", "429", "500")) {
            assertThat(createResponses.at("/" + status + "/content/application~1problem+json/schema/$ref").asString())
                    .as("response %s", status)
                    .isEqualTo("#/components/schemas/" + OpenApiConfig.PROBLEM_SCHEMA);
        }
        JsonNode problem = docs.at("/components/schemas/" + OpenApiConfig.PROBLEM_SCHEMA + "/properties");
        assertThat(problem.propertyNames()).contains("type", "title", "status", "detail", "code", "errors");
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

    @Test
    void apiDocs_membershipEndpoints_documentsListRemovalAndMemberSchema() throws Exception {
        var docs = apiDocs();
        assertThat(docs.at("/paths/~1api~1v1~1rooms~1{roomId}~1members/get").isMissingNode()).isFalse();
        assertThat(docs.at("/paths/~1api~1v1~1rooms~1{roomId}~1members~1{userId}/delete/responses/204").isMissingNode()).isFalse();
        var schema = docs.at("/components/schemas/MemberResponse/properties");
        assertThat(schema.propertyNames()).containsExactlyInAnyOrder("id", "name", "avatarUrl", "role");
        assertThat(schema.path("role").path("enum")).isEqualTo(objectMapper.valueToTree(List.of("OWNER", "ADMIN", "MEMBER")));
    }

}
