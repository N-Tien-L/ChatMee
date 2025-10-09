package com.lnt.chatmee.service;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Objects;

@Component
public class PresenceEventListener {

    private final RedisPresencePublisher presencePublisher;

    public PresenceEventListener(RedisPresencePublisher presencePublisher) {
        this.presencePublisher = presencePublisher;
    }

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        StompHeaderAccessor headers = StompHeaderAccessor.wrap(event.getMessage());
        // In a real app, you'd get the user ID from the security context
        // For this example, we'll extract it from a header if present
        String userId = Objects.requireNonNull(headers.getFirstNativeHeader("userId"));
        if (userId != null) {
            presencePublisher.publishPresenceUpdate(userId, true);
        }
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headers = StompHeaderAccessor.wrap(event.getMessage());
        String userId = Objects.requireNonNull(headers.getFirstNativeHeader("userId"));
        if (userId != null) {
            presencePublisher.publishPresenceUpdate(userId, false);
        }
    }
}