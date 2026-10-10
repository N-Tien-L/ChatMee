package com.lnt.chatmee.service;

import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

class PresenceEventListenerTest {
    private final RedisPresencePublisher publisher = mock(RedisPresencePublisher.class);
    private final PresenceEventListener listener = new PresenceEventListener(publisher);

    @Test
    void handleWebSocketConnectListener_nullPrincipal_doesNotPublish() {
        listener.handleWebSocketConnectListener(new SessionConnectedEvent(this,
                MessageBuilder.withPayload(new byte[0]).build(), null));
        verifyNoInteractions(publisher);
    }

    @Test
    void handleWebSocketConnectListener_authenticatedPrincipal_publishesOnline() {
        listener.handleWebSocketConnectListener(new SessionConnectedEvent(this,
                MessageBuilder.withPayload(new byte[0]).build(), () -> "internal-user"));
        verify(publisher).publishPresenceUpdate("internal-user", true);
    }

    @Test
    void handleWebSocketDisconnectListener_nullPrincipal_doesNotPublish() {
        listener.handleWebSocketDisconnectListener(new SessionDisconnectEvent(this,
                MessageBuilder.withPayload(new byte[0]).build(), "session", CloseStatus.NORMAL, null));
        verifyNoInteractions(publisher);
    }

    @Test
    void handleWebSocketDisconnectListener_authenticatedPrincipal_publishesOffline() {
        listener.handleWebSocketDisconnectListener(new SessionDisconnectEvent(this,
                MessageBuilder.withPayload(new byte[0]).build(), "session", CloseStatus.NORMAL, () -> "internal-user"));
        verify(publisher).publishPresenceUpdate("internal-user", false);
    }
}
