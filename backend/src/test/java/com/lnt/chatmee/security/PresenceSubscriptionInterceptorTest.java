package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lnt.chatmee.service.PresenceVisibilityService;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.MessageBuilder;
import tools.jackson.databind.ObjectMapper;

class PresenceSubscriptionInterceptorTest {
    private final PresenceVisibilityService visibility = mock(PresenceVisibilityService.class);
    private final WsSessionRegistry sessions = mock(WsSessionRegistry.class);
    private final PresenceSubscriptionInterceptor interceptor = new PresenceSubscriptionInterceptor(visibility, sessions, new ObjectMapper());
    private Message<?> frame(Object payload, String destination, SimpMessageType type) {
        var headers = SimpMessageHeaderAccessor.create(type);
        headers.setSessionId("socket"); headers.setDestination(destination);
        return MessageBuilder.createMessage(payload, headers.getMessageHeaders());
    }
    private Message<?> presence(Object payload) { return frame(payload, "/topic/presence", SimpMessageType.MESSAGE); }
    @Test void beforeHandle_sharedMember_checksCurrentRecipientAtDelivery() {
        when(sessions.userForSocket("socket")).thenReturn("viewer");
        when(visibility.canSee("viewer", "subject")).thenReturn(true).thenReturn(false);
        Message<?> message = presence(Map.of("userId", "subject", "online", true));
        assertThat(interceptor.beforeHandle(message, null, null)).isSameAs(message);
        assertThat(interceptor.beforeHandle(message, null, null)).isNull();
        verify(visibility, times(2)).canSee("viewer", "subject");
    }
    @Test void beforeHandle_serializedPayload_authorizesSameShape() {
        when(sessions.userForSocket("socket")).thenReturn("viewer");
        when(visibility.canSee("viewer", "subject")).thenReturn(true);
        Message<?> message = presence("{\"userId\":\"subject\",\"online\":false}".getBytes(StandardCharsets.UTF_8));
        assertThat(interceptor.beforeHandle(message, null, null)).isSameAs(message);
    }
    @Test void beforeHandle_expiredOrUnknownSession_dropsPresence() {
        assertThat(interceptor.beforeHandle(presence(Map.of("userId", "subject", "online", true)), null, null)).isNull();
        verifyNoInteractions(visibility);
    }
    @Test void beforeHandle_authorizationUnavailable_dropsFrame() {
        when(sessions.userForSocket("socket")).thenReturn("viewer");
        when(visibility.canSee("viewer", "subject")).thenThrow(new DataAccessResourceFailureException("synthetic"));
        assertThat(interceptor.beforeHandle(presence(Map.of("userId", "subject", "online", true)), null, null)).isNull();
    }
    @ParameterizedTest
    @ValueSource(strings = {"not json", "[]", "{}", "{\"userId\":42,\"online\":true}", "{\"userId\":\"\",\"online\":true}", "{\"userId\":\"user\",\"online\":\"true\"}"})
    void beforeHandle_malformedPayload_failsClosed(String json) {
        when(sessions.userForSocket("socket")).thenReturn("viewer");
        assertThat(interceptor.beforeHandle(presence(json.getBytes(StandardCharsets.UTF_8)), null, null)).isNull();
        verifyNoInteractions(visibility);
    }
    @Test void beforeHandle_otherDestinationOrControlFrame_preservesBehavior() {
        Message<?> other = frame(new byte[0], "/user/queue/events", SimpMessageType.MESSAGE);
        Message<?> control = frame(new byte[0], "/topic/presence", SimpMessageType.CONNECT_ACK);
        assertThat(interceptor.beforeHandle(other, null, null)).isSameAs(other);
        assertThat(interceptor.beforeHandle(control, null, null)).isSameAs(control);
        verifyNoInteractions(visibility, sessions);
    }
}
