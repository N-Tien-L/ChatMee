package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.lnt.chatmee.dto.PresenceMessage;
import com.lnt.chatmee.dto.TypingMessage;
import com.lnt.chatmee.exception.ErrorCode;
import com.lnt.chatmee.exception.GlobalExceptionHandler;

import tools.jackson.databind.json.JsonMapper;

/**
 * The Boot JsonMapper built from the real application.properties keeps the Jackson 2 / Boot 3 behaviour that
 * Jackson 3 changed by default. The same mapper backs the HTTP converters, the STOMP message converter
 * (Boot's WebSocketMessagingAutoConfiguration) and the security ProblemDetail writer.
 */
class JacksonCompatibilityTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            // No profile file: only application.properties carries the Jackson settings.
            .withPropertyValues("spring.profiles.active=none")
            .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class));

    private void withMapper(Consumer<JsonMapper> assertions) {
        runner.run(context -> assertions.accept(context.getBean(JsonMapper.class)));
    }

    @Test
    void readStompPayload_nullPrimitiveFlags_bindFalse() {
        withMapper(mapper -> {
            assertThat(mapper.readValue("{\"roomId\":\"r\",\"typing\":null}", TypingMessage.class).isTyping()).isFalse();
            assertThat(mapper.readValue("{\"userId\":\"u\",\"online\":null}", PresenceMessage.class).isOnline()).isFalse();
        });
    }

    @Test
    void readValue_trailingContentAfterJson_isIgnored() {
        withMapper(mapper -> assertThat(mapper.readValue("{\"roomId\":\"r\",\"typing\":true} trailing", TypingMessage.class)
                .isTyping()).isTrue());
    }

    @Test
    void writeProblemDetail_keepsDeclarationOrderNotAlphabetical() {
        withMapper(mapper -> assertThat(mapper.writeValueAsString(
                GlobalExceptionHandler.problem(ErrorCode.FORBIDDEN_ACTION, "Access denied", "/api/v1/rooms")))
                .isEqualTo("{\"type\":\"urn:chatmee:error:forbidden-action\",\"title\":\"Forbidden\",\"status\":403,"
                        + "\"detail\":\"Access denied\",\"instance\":\"/api/v1/rooms\",\"code\":\"FORBIDDEN_ACTION\",\"errors\":[]}"));
    }
}
