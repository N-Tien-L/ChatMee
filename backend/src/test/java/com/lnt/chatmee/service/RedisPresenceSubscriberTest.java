package com.lnt.chatmee.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.connection.Message;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.io.IOException;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RedisPresenceSubscriberTest {

    @Mock
    private SimpMessagingTemplate simpMessagingTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private PresenceService presenceService;

    @InjectMocks
    private RedisPresenceSubscriber subscriber;

    @Test
    void onMessage_validOnlineMessage_forwardsWithoutMutatingRegistry() throws Exception {
        Message message = mock(Message.class);
        when(message.getBody()).thenReturn("{\"userId\":\"user1\",\"online\":true}".getBytes());

        Map<String, Object> presenceUpdate = Map.of("userId", "user1", "online", true);
        when(objectMapper.readValue(anyString(), any(TypeReference.class))).thenReturn(presenceUpdate);

        subscriber.onMessage(message, new byte[0]);

        verifyNoInteractions(presenceService);
        verify(simpMessagingTemplate).convertAndSend("/topic/presence", presenceUpdate);
    }

    @Test
    void onMessage_validOfflineMessage_forwardsWithoutMutatingRegistry() throws Exception {
        Message message = mock(Message.class);
        when(message.getBody()).thenReturn("{\"userId\":\"user2\",\"online\":false}".getBytes());

        Map<String, Object> presenceUpdate = Map.of("userId", "user2", "online", false);
        when(objectMapper.readValue(anyString(), any(TypeReference.class))).thenReturn(presenceUpdate);

        subscriber.onMessage(message, new byte[0]);

        verifyNoInteractions(presenceService);
        verify(simpMessagingTemplate).convertAndSend("/topic/presence", presenceUpdate);
    }

    @Test
    void onMessage_nullOnlineField_forwardsWithoutMutatingRegistry() throws Exception {
        Message message = mock(Message.class);
        when(message.getBody()).thenReturn("{\"userId\":\"user3\"}".getBytes());

        Map<String, Object> presenceUpdate = Map.of("userId", "user3"); // online is null
        when(objectMapper.readValue(anyString(), any(TypeReference.class))).thenReturn(presenceUpdate);

        subscriber.onMessage(message, new byte[0]);

        verifyNoInteractions(presenceService);
        verify(simpMessagingTemplate).convertAndSend("/topic/presence", presenceUpdate);
    }

    @Test
    void onMessage_ioException_handlesGracefully() throws Exception {
        Message message = mock(Message.class);
        when(message.getBody()).thenReturn("invalid".getBytes());

        when(objectMapper.readValue(anyString(), any(TypeReference.class)))
            .thenThrow(new com.fasterxml.jackson.core.JsonParseException(null, "parse error"));

        // Should not throw
        subscriber.onMessage(message, new byte[0]);

        verifyNoInteractions(presenceService);
        verifyNoInteractions(simpMessagingTemplate);
    }

    @Test
    void onMessage_unexpectedException_handlesGracefully() {
        Message message = mock(Message.class);
        // Throw an unexpected runtime exception when getBody is called
        when(message.getBody()).thenThrow(new RuntimeException("unexpected error"));

        // Should not throw
        subscriber.onMessage(message, new byte[0]);

        verifyNoInteractions(presenceService);
        verifyNoInteractions(simpMessagingTemplate);
    }
}
