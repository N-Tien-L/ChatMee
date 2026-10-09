package com.lnt.chatmee.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.support.SimpAnnotationMethodMessageHandler;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.util.MimeTypeUtils;
import org.springframework.validation.beanvalidation.OptionalValidatorFactoryBean;

import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.MessageService;

class ChatWebSocketControllerAuthTest {
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final UserRepository users = mock(UserRepository.class);
    private final com.lnt.chatmee.repository.ParticipantRepository participants = mock(com.lnt.chatmee.repository.ParticipantRepository.class);
    private final MessageService messages = spy(new MessageService(mock(com.lnt.chatmee.repository.ChatRoomRepository.class), participants, mock(com.lnt.chatmee.repository.MessageRepository.class), users));
    private final StaticApplicationContext context = new StaticApplicationContext();
    private final OptionalValidatorFactoryBean validator = new OptionalValidatorFactoryBean();
    private SimpAnnotationMethodMessageHandler handler;

    @BeforeEach
    void setUp() {
        context.getBeanFactory().registerSingleton("chatController",
                new ChatWebSocketController(messaging, messages));
        context.refresh();
        validator.afterPropertiesSet();
        handler = new SimpAnnotationMethodMessageHandler(
                new ExecutorSubscribableChannel(), new ExecutorSubscribableChannel(), messaging);
        handler.setApplicationContext(context);
        handler.setDestinationPrefixes(List.of("/app"));
        handler.setValidator(validator);
        handler.setMessageConverter(new MappingJackson2MessageConverter());
        handler.afterPropertiesSet();
    }

    @AfterEach
    void tearDown() {
        validator.close();
        context.close();
    }

    @Test
    void sendMessage_forgedSender_savesAndBroadcastsPrincipalIdentity() {
        authenticatedMember();
        dispatch("/app/chat.sendMessage", () -> "internal-user");
        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messages).persistMessage(saved.capture());
        assertEquals("internal-user", saved.getValue().getSenderId());
        verify(messaging).convertAndSend(eq("/topic/public/room"), argThat((ChatMessageResponse response) ->
                response.senderId().equals("internal-user") && response.senderName().equals("Real Name")));
        verify(participants).existsByChatRoomIdAndUserId("room", "internal-user");
        verify(users, never()).findById("victim");
    }

    @Test
    void addUser_forgedSender_broadcastsPrincipalIdentity() {
        authenticatedMember();
        dispatch("/app/chat.addUser", () -> "internal-user");
        verify(messaging).convertAndSend(eq("/topic/public/room"), argThat((ChatMessageResponse response) ->
                response.senderId().equals("internal-user")
                        && response.senderName().equals("Real Name")
                        && response.content().equals("Real Name joined the chat")));
        verify(participants).existsByChatRoomIdAndUserId("room", "internal-user");
        verify(users, never()).findById("victim");
        verify(messages, never()).persistMessage(any());
    }

    @Test
    void sendMessage_nonMemberPrincipal_doesNotSaveOrBroadcast() {
        when(users.findById("internal-user")).thenReturn(Optional.of(
                User.builder().id("internal-user").name("Real Name").build()));
        dispatch("/app/chat.sendMessage", () -> "internal-user");
        verify(participants).existsByChatRoomIdAndUserId("room", "internal-user");
        verify(messages, never()).persistMessage(any());
        assertPrivateError();
    }

    @Test
    void addUser_nonMemberPrincipal_doesNotBroadcast() {
        when(users.findById("internal-user")).thenReturn(Optional.of(
                User.builder().id("internal-user").name("Real Name").build()));
        dispatch("/app/chat.addUser", () -> "internal-user");
        verify(participants).existsByChatRoomIdAndUserId("room", "internal-user");
        verify(messages, never()).persistMessage(any());
        assertPrivateError();
    }

    @Test
    void sendMessage_missingPrincipal_doesNotUsePayloadIdentity() {
        dispatch("/app/chat.sendMessage", null);
        verifyNoInteractions(users, participants, messages, messaging);
    }

    @Test
    void sendMessage_processingFailure_sendsErrorOnlyToPrincipal() {
        when(users.findById("internal-user")).thenThrow(new IllegalStateException("lookup failed"));
        dispatch("/app/chat.sendMessage", () -> "internal-user");
        verify(messages, never()).persistMessage(any());
        assertPrivateError();
    }

    @Test
    void addUser_processingFailure_sendsErrorOnlyToPrincipal() {
        when(users.findById("internal-user")).thenThrow(new IllegalStateException("lookup failed"));
        dispatch("/app/chat.addUser", () -> "internal-user");
        verify(messages, never()).persistMessage(any());
        assertPrivateError();
    }

    @Test
    void sendMessage_validMessage_persistsBeforeBroadcast() {
        authenticatedMember();
        var storedAt = java.time.Instant.parse("2026-10-08T10:00:00Z");
        doAnswer(invocation -> {
            Message saved = invocation.getArgument(0);
            saved.setId("stored-id");
            saved.setCreatedAt(storedAt);
            return saved;
        }).when(messages).persistMessage(any(Message.class));
        dispatch("/app/chat.sendMessage", () -> "internal-user");
        var order = inOrder(messages, messaging);
        order.verify(messages).persistMessage(any(Message.class));
        order.verify(messaging).convertAndSend(eq("/topic/public/room"), argThat((ChatMessageResponse response) ->
                response.id().equals("stored-id") && response.createdAt().equals(storedAt)));
    }

    @Test
    void sendMessage_saveFailure_sendsPrivateErrorWithoutBroadcast() {
        authenticatedMember();
        doThrow(new IllegalStateException("save failed")).when(messages).persistMessage(any(Message.class));
        dispatch("/app/chat.sendMessage", () -> "internal-user");
        assertPrivateError();
    }

    private void assertPrivateError() {
        verify(messaging).convertAndSendToUser(eq("internal-user"), eq("/queue/errors"),
                argThat((StompError error) -> "temp".equals(error.getTempId()) && !error.getMessage().isBlank()));
        verifyNoMoreInteractions(messaging);
    }

    private void authenticatedMember() {
        doAnswer(invocation -> invocation.getArgument(0)).when(messages).persistMessage(any());
        when(users.findById("internal-user")).thenReturn(Optional.of(
                User.builder().id("internal-user").name("Real Name").build()));
        when(participants.existsByChatRoomIdAndUserId("room", "internal-user")).thenReturn(true);
        when(users.findById("victim")).thenReturn(Optional.of(
                User.builder().id("victim").name("Victim Name").build()));
        when(participants.existsByChatRoomIdAndUserId("room", "victim")).thenReturn(true);
    }

    private void dispatch(String destination, Principal principal) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setDestination(destination);
        headers.setSessionId("session");
        headers.setSessionAttributes(Map.of());
        headers.setUser(principal);
        headers.setContentType(MimeTypeUtils.APPLICATION_JSON);
        byte[] payload = """
                {"roomId":"room","content":"hello","messageType":"TEXT",
                 "senderId":"victim","senderName":"Forged Name","tempId":"temp"}
                """.getBytes(StandardCharsets.UTF_8);
        handler.handleMessage(MessageBuilder.createMessage(payload, headers.getMessageHeaders()));
    }
}
