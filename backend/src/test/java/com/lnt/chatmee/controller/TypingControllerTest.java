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

import com.lnt.chatmee.dto.TypingMessage;
import com.lnt.chatmee.service.ParticipantService;

class TypingControllerTest {
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final ParticipantService participants = mock(ParticipantService.class);
    private final StaticApplicationContext context = new StaticApplicationContext();
    private SimpAnnotationMethodMessageHandler handler;

    @BeforeEach
    void setUp() {
        context.getBeanFactory().registerSingleton("typingController", new TypingController(messaging, participants));
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
    void handleTypingEvent_forgedIdentity_broadcastsPrincipalIdentity() {
        when(participants.isUserParticipant("room", "internal-user")).thenReturn(true);
        dispatch(() -> "internal-user", "{\"userId\":\"victim\",\"typing\":true}");
        verify(messaging).convertAndSend(eq("/topic/rooms/room/typing"), argThat((TypingMessage message) ->
                "internal-user".equals(message.getUserId()) && "room".equals(message.getRoomId()) && message.isTyping()));
        verify(participants).isUserParticipant("room", "internal-user");
        verifyNoMoreInteractions(messaging);
    }

    @Test
    void handleTypingEvent_identityOmitted_broadcastsSameMessageShape() {
        when(participants.isUserParticipant("room", "internal-user")).thenReturn(true);
        dispatch(() -> "internal-user", "{\"typing\":false}");
        verify(messaging).convertAndSend(eq("/topic/rooms/room/typing"), argThat((TypingMessage message) ->
                "internal-user".equals(message.getUserId()) && !message.isTyping()));
    }

    @Test
    void handleTypingEvent_nonMember_dropsEvent() {
        dispatch(() -> "internal-user", "{\"userId\":\"victim\",\"typing\":true}");
        verify(participants).isUserParticipant("room", "internal-user");
        verifyNoInteractions(messaging);
    }

    @Test
    void handleTypingEvent_missingPrincipal_dropsEvent() {
        dispatch(null, "{\"userId\":\"victim\",\"typing\":true}");
        verifyNoInteractions(participants, messaging);
    }

    @Test
    void handleTypingEvent_missingRoom_dropsEvent() {
        dispatch(() -> "internal-user", "/app/rooms/ /typing", "{\"typing\":true}");
        verifyNoInteractions(participants, messaging);
    }

    private void dispatch(Principal principal, String json) {
        dispatch(principal, "/app/rooms/room/typing", json);
    }

    private void dispatch(Principal principal, String destination, String json) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setDestination(destination);
        headers.setSessionId("typing-session");
        headers.setSessionAttributes(java.util.Map.of());
        headers.setUser(principal);
        headers.setContentType(MimeTypeUtils.APPLICATION_JSON);
        handler.handleMessage(MessageBuilder.createMessage(json.getBytes(StandardCharsets.UTF_8), headers.getMessageHeaders()));
    }
}
