package com.lnt.chatmee.service;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;

@Component
public class PresenceEventListener {

    private final RedisPresencePublisher presencePublisher;

    public PresenceEventListener(RedisPresencePublisher presencePublisher) {
        this.presencePublisher = presencePublisher;
    }

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        Principal principal = event.getUser();
        if (principal != null) {
            presencePublisher.publishPresenceUpdate(principal.getName(), true);
        }
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        Principal principal = event.getUser();
        if (principal != null) {
            presencePublisher.publishPresenceUpdate(principal.getName(), false);
        }
    }
}
