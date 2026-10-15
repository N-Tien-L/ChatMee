package com.lnt.chatmee.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.nio.charset.StandardCharsets;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.util.MimeTypeUtils;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.support.SimpAnnotationMethodMessageHandler;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.validation.beanvalidation.OptionalValidatorFactoryBean;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.MessageService;

class ChatWebSocketControllerValidationTest {
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final UserRepository users = mock(UserRepository.class);
    private final com.lnt.chatmee.service.ParticipantService participants = mock(com.lnt.chatmee.service.ParticipantService.class);
    private final MessageService messages = spy(new MessageService(mock(com.lnt.chatmee.repository.ChatRoomRepository.class), participants, mock(com.lnt.chatmee.repository.MessageRepository.class), users, mock(com.lnt.chatmee.service.UserEventPublisher.class),
            mock(com.lnt.chatmee.service.DirectMessageRequestService.class),
            mock(com.lnt.chatmee.repository.ParticipantRepository.class),
            mock(com.lnt.chatmee.service.BlockService.class)));
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
        handler.setDestinationPrefixes(java.util.List.of("/app"));
        handler.setValidator(validator);
        handler.setMessageConverter(new JacksonJsonMessageConverter());
        handler.afterPropertiesSet();
    }

    @AfterEach
    void tearDown() {
        validator.close();
        context.close();
    }

    /** Private errors carry the originating STOMP session id, so only that session receives them. */
    private static Map<String, Object> privateTo(String sessionId) {
        return argThat(headers -> sessionId.equals(headers.get(SimpMessageHeaderAccessor.SESSION_ID_HEADER)));
    }

    @Test
    void sendMessage_contentOf5001Characters_reportsErrorWithoutSavingOrBroadcasting() {
        dispatch("/app/chat.sendMessage", 5001);
        verifyNoInteractions(messages, users, participants);
        ArgumentCaptor<StompError> error = ArgumentCaptor.forClass(StompError.class);
        verify(messaging).convertAndSendToUser(eq("test-user"), eq("/queue/errors"), error.capture(), privateTo("test-session"));
        assertEquals("test-temp", error.getValue().getTempId());
        assertTrue(error.getValue().getMessage().contains("5000"));
        verifyNoMoreInteractions(messaging);
    }

    @Test
    void sendMessage_contentOf5000Characters_savesAndBroadcasts() {
        when(users.findById("test-user")).thenReturn(Optional.of(
                User.builder().id("test-user").name("Test User").build()));
        when(participants.isUserParticipant("test-room", "test-user")).thenReturn(true);
        doAnswer(invocation -> invocation.getArgument(0)).when(messages).persistMessage(any());
        dispatch("/app/chat.sendMessage", 5000);
        verify(messages).persistMessage(argThat(message -> message.getContent().length() == 5000));
        verify(messaging).convertAndSend(eq("/topic/rooms/test-room"), any(ChatMessageResponse.class));
        verifyNoMoreInteractions(messaging);
    }

    @Test
    void sendMessage_systemMessageType_reportsErrorWithoutSavingOrBroadcasting() {
        dispatch("/app/chat.sendMessage", 10, com.lnt.chatmee.model.Message.MessageType.SYSTEM);
        verifyNoInteractions(messages, users, participants);
        ArgumentCaptor<StompError> error = ArgumentCaptor.forClass(StompError.class);
        verify(messaging).convertAndSendToUser(eq("test-user"), eq("/queue/errors"), error.capture(), privateTo("test-session"));
        assertEquals("test-temp", error.getValue().getTempId());
        assertEquals("VALIDATION_FAILED", error.getValue().getCode());
        assertTrue(error.getValue().getMessage().contains("Only TEXT messages can be sent"));
        verifyNoMoreInteractions(messaging);
    }

    @Test
    void sendMessage_tempIdOf65Characters_reportsErrorWithoutSavingOrBroadcasting() {
        dispatch("/app/chat.sendMessage", 10, com.lnt.chatmee.model.Message.MessageType.TEXT, "t".repeat(65));
        verifyNoInteractions(messages, users, participants);
        ArgumentCaptor<StompError> error = ArgumentCaptor.forClass(StompError.class);
        verify(messaging).convertAndSendToUser(eq("test-user"), eq("/queue/errors"), error.capture(), privateTo("test-session"));
        assertEquals("VALIDATION_FAILED", error.getValue().getCode());
        assertTrue(error.getValue().getMessage().contains("64"));
        verifyNoMoreInteractions(messaging);
    }

    @Test
    void sendMessage_tempIdOf64Characters_savesAndBroadcasts() {
        when(users.findById("test-user")).thenReturn(Optional.of(
                User.builder().id("test-user").name("Test User").build()));
        when(participants.isUserParticipant("test-room", "test-user")).thenReturn(true);
        doAnswer(invocation -> invocation.getArgument(0)).when(messages).persistMessage(any());
        dispatch("/app/chat.sendMessage", 10, com.lnt.chatmee.model.Message.MessageType.TEXT, "t".repeat(64));
        verify(messages).persistMessage(argThat(message -> "t".repeat(64).equals(message.getClientMessageId())));
        verify(messaging).convertAndSend(eq("/topic/rooms/test-room"), any(ChatMessageResponse.class));
        verifyNoMoreInteractions(messaging);
    }

    @Test
    void addUser_removedDestination_isNotHandled() {
        dispatch("/app/chat.addUser", 10);
        verifyNoInteractions(messages, users, participants, messaging);
    }

    private void dispatch(String destination, int length) {
        dispatch(destination, length, com.lnt.chatmee.model.Message.MessageType.TEXT);
    }

    private void dispatch(String destination, int length, com.lnt.chatmee.model.Message.MessageType type) {
        dispatch(destination, length, type, "test-temp");
    }

    private void dispatch(String destination, int length, com.lnt.chatmee.model.Message.MessageType type, String tempId) {
        ChatMessageRequest request = new ChatMessageRequest();
        request.setRoomId("test-room");
        request.setContent("x".repeat(length));
        request.setMessageType(type);
        request.setTempId(tempId);
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setDestination(destination);
        headers.setSessionId("test-session");
        headers.setSessionAttributes(Map.of());
        headers.setUser(() -> "test-user");
        headers.setContentType(MimeTypeUtils.APPLICATION_JSON);
        tools.jackson.databind.node.ObjectNode json = new tools.jackson.databind.ObjectMapper().valueToTree(request);
        json.put("senderId", "test-user");
        byte[] payload = json
                .toString().getBytes(StandardCharsets.UTF_8);
        handler.handleMessage(MessageBuilder.createMessage(payload, headers.getMessageHeaders()));
    }
}
