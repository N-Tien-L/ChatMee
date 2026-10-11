package com.lnt.chatmee.service;

import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

class PresenceEventListenerTest {
    private final PresenceService publisher = mock(PresenceService.class);
    private final PresenceEventListener listener = new PresenceEventListener(publisher);

    @Test
    void handleWebSocketConnectListener_nullPrincipal_doesNotPublish() {
        listener.handleWebSocketConnectListener(new SessionConnectedEvent(this,
                MessageBuilder.withPayload(new byte[0]).setHeader("simpSessionId", "session").build(), null));
        verifyNoInteractions(publisher);
    }

    @Test
    void handleWebSocketConnectListener_authenticatedPrincipal_registersSession() {
        listener.handleWebSocketConnectListener(new SessionConnectedEvent(this,
                MessageBuilder.withPayload(new byte[0]).setHeader("simpSessionId", "session").build(), () -> "internal-user"));
        verify(publisher).userConnected("internal-user", "session");
    }

    @Test
    void handleWebSocketDisconnectListener_nullPrincipal_doesNotPublish() {
        listener.handleWebSocketDisconnectListener(new SessionDisconnectEvent(this,
                MessageBuilder.withPayload(new byte[0]).setHeader("simpSessionId", "session").build(), "session", CloseStatus.NORMAL, null));
        verifyNoInteractions(publisher);
    }

    @Test
    void handleWebSocketDisconnectListener_authenticatedPrincipal_removesSession() {
        listener.handleWebSocketDisconnectListener(new SessionDisconnectEvent(this,
                MessageBuilder.withPayload(new byte[0]).setHeader("simpSessionId", "session").build(), "session", CloseStatus.NORMAL, () -> "internal-user"));
        verify(publisher).userDisconnected("internal-user", "session");
    }
}
