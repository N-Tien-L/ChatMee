package com.lnt.chatmee.config;

import java.util.Map;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;

import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/**
 * OpenAPI document for the REST API. Every operation documents the shared {@code application/problem+json}
 * error contract described in docs/design/error-handling.md.
 */
@Configuration
public class OpenApiConfig {

    static final String PROBLEM_SCHEMA = "Problem";
    private static final String SESSION_SCHEME = "sessionCookie";

    private static final Map<String, String> ERROR_RESPONSES = Map.of(
            "400", "Invalid request (VALIDATION_FAILED or INVALID_ARGUMENT)",
            "401", "Not authenticated (UNAUTHENTICATED)",
            "403", "Authenticated but not allowed (FORBIDDEN)",
            "404", "Resource not found",
            "409", "Conflict with the current state",
            "429", "Rate limit exceeded (RATE_LIMITED); see Retry-After",
            "500", "Unexpected error (INTERNAL_ERROR)");

    @Bean
    public OpenAPI chatMeeOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("ChatMee API")
                        .version("v1")
                        .description("REST API of ChatMee. Real-time messaging uses STOMP over WebSocket "
                                + "(see docs/design/websocket-protocol.md). Authentication is an OAuth2 login session cookie; "
                                + "state-changing requests also need the X-XSRF-TOKEN header.")
                        .license(new License().name("MIT")))
                .components(new Components()
                        .addSecuritySchemes(SESSION_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.COOKIE)
                                .name("JSESSIONID")))
                .addSecurityItem(new SecurityRequirement().addList(SESSION_SCHEME));
    }

    @Bean
    public OpenApiCustomizer problemDetailResponses() {
        return openApi -> {
            // Registered here rather than on the OpenAPI bean: springdoc rebuilds the schema map while scanning.
            openApi.getComponents().addSchemas(PROBLEM_SCHEMA, problemSchema());
            openApi.getPaths().values().forEach(path -> path.readOperations().forEach(operation ->
                    ERROR_RESPONSES.forEach((status, description) -> {
                        if (!operation.getResponses().containsKey(status)) {
                            operation.getResponses().addApiResponse(status, problemResponse(description));
                        }
                    })));
        };
    }

    private static ApiResponse problemResponse(String description) {
        return new ApiResponse()
                .description(description)
                .content(new Content().addMediaType(MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                        new io.swagger.v3.oas.models.media.MediaType()
                                .schema(new Schema<>().$ref("#/components/schemas/" + PROBLEM_SCHEMA))));
    }

    @SuppressWarnings("rawtypes")
    private static Schema problemSchema() {
        Schema base = ModelConverters.getInstance().readAllAsResolvedSchema(ProblemDetail.class).schema;
        Schema schema = base != null ? base : new ObjectSchema();
        schema.addProperty("code", new StringSchema().description("Stable error code, e.g. VALIDATION_FAILED"));
        schema.addProperty("errors", new ArraySchema().items(new ObjectSchema()
                .addProperty("field", new StringSchema())
                .addProperty("message", new StringSchema()))
                .description("Field errors; empty when not applicable"));
        if (base == null) {
            schema.addProperty("type", new StringSchema());
            schema.addProperty("title", new StringSchema());
            schema.addProperty("status", new IntegerSchema());
            schema.addProperty("detail", new StringSchema());
            schema.addProperty("instance", new StringSchema());
        }
        return schema;
    }
}
