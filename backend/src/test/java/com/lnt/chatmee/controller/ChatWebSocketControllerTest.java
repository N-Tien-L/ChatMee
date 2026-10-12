package com.lnt.chatmee.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.service.MessageService;

@ExtendWith(MockitoExtension.class)
class ChatWebSocketControllerTest {
    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private MessageService messageService;

    @InjectMocks
    private ChatWebSocketController controller;

    @Test
    void sendMessage_broadcastThrowsAfterSave_doesNotSendInternalErrorToSender() {
        ChatMessageRequest request = new ChatMessageRequest();
        request.setRoomId("room1");
        request.setContent("hello");
        request.setTempId("client-1");
        ChatMessageResponse saved = ChatMessageResponse.builder().id("stored-1").tempId("client-1")
                .clientMessageId("client-1").chatRoomId("room1").senderId("user1").senderName("Alice")
                .content("hello").build();
        when(messageService.sendMessage(request, "user1")).thenReturn(saved);
        doThrow(new IllegalStateException("broker unavailable"))
                .when(messagingTemplate).convertAndSend(eq("/topic/rooms/room1"), any(Object.class));

        controller.sendMessage(request, () -> "user1", "session-1");

        verify(messageService).sendMessage(request, "user1");
        verify(messagingTemplate, never()).convertAndSendToUser(anyString(), anyString(), any(), anyMap());
    }
}
