package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.support.SimpAnnotationMethodMessageHandler;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.util.MimeTypeUtils;

import com.lnt.chatmee.dto.PresenceMessage;
import com.lnt.chatmee.service.PresenceService;

class PresenceWebSocketControllerTest {
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final PresenceService presence = mock(PresenceService.class);
    private final StaticApplicationContext context = new StaticApplicationContext();
    private SimpAnnotationMethodMessageHandler handler;

    @BeforeEach
    void setUp() {
        context.getBeanFactory().registerSingleton("presenceController", new PresenceWebSocketController(messaging, presence));
        context.refresh();
        handler = new SimpAnnotationMethodMessageHandler(
                new ExecutorSubscribableChannel(), new ExecutorSubscribableChannel(), messaging);
        handler.setApplicationContext(context);
        handler.setDestinationPrefixes(List.of("/app"));
        handler.setMessageConverter(new MappingJackson2MessageConverter());
        handler.afterPropertiesSet();
    }

    @AfterEach
    void tearDown() { context.close(); }

    @Test
    void handlePresenceEvent_forgedOnlineIdentity_updatesAndBroadcastsPrincipal() {
        dispatch(() -> "internal-user", "{\"userId\":\"victim\",\"online\":true}");
        verify(presence).userConnected("internal-user");
        verify(messaging).convertAndSend(eq("/topic/presence"), argThat((PresenceMessage message) ->
                "internal-user".equals(message.getUserId()) && message.isOnline()));
        verifyNoMoreInteractions(presence, messaging);
    }

    @Test
    void handlePresenceEvent_forgedOfflineIdentity_updatesAndBroadcastsPrincipal() {
        dispatch(() -> "internal-user", "{\"userId\":\"victim\",\"online\":false}");
        verify(presence).userDisconnected("internal-user");
        verify(messaging).convertAndSend(eq("/topic/presence"), argThat((PresenceMessage message) ->
                "internal-user".equals(message.getUserId()) && !message.isOnline()));
        verifyNoMoreInteractions(presence, messaging);
    }

    @Test
    void handlePresenceEvent_identityOmitted_broadcastsSameMessageShape() {
        dispatch(() -> "internal-user", "{\"online\":true}");
        verify(presence).userConnected("internal-user");
        verify(messaging).convertAndSend(eq("/topic/presence"), argThat((PresenceMessage message) ->
                "internal-user".equals(message.getUserId()) && message.isOnline()));
    }

    @Test
    void handlePresenceEvent_missingPrincipal_dropsEvent() {
        dispatch(null, "{\"userId\":\"victim\",\"online\":true}");
        verifyNoInteractions(presence, messaging);
    }

    private void dispatch(Principal principal, String json) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setDestination("/app/presence");
        headers.setSessionId("presence-session");
        headers.setSessionAttributes(java.util.Map.of());
        headers.setUser(principal);
        headers.setContentType(MimeTypeUtils.APPLICATION_JSON);
        handler.handleMessage(MessageBuilder.createMessage(json.getBytes(StandardCharsets.UTF_8), headers.getMessageHeaders()));
    }
}
