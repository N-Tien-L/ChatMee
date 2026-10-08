// File: backend/src/main/java/com/lnt/chatmee/controller/ChatWebSocketController.java
package com.lnt.chatmee.controller;

import java.security.Principal;
import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.validation.annotation.Validated;

import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.MessageService;
import com.lnt.chatmee.service.ParticipantService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@Controller
@Validated
@RequiredArgsConstructor
public class ChatWebSocketController {

    private static final Logger logger = LoggerFactory.getLogger(ChatWebSocketController.class);
    
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageService messageService;
    private final UserRepository userRepository;
    private final ParticipantService participantService;

    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Valid @Payload ChatMessageRequest request, Principal principal) {
        if (principal == null) {
            return;
        }
        try {
            String userId = principal.getName();
            User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));

            // Verify user is participant of the room
            if (!participantService.isUserParticipant(request.getRoomId(), userId)) {
                logger.warn("User {} attempted to send message to room {} without being a participant", 
                    userId, request.getRoomId());
                sendError(request, principal, "Room membership required");
                return;
            }

            // Create message object
            Message message = Message.builder()
                .id(UUID.randomUUID().toString())
                .chatRoomId(request.getRoomId())
                .senderId(userId)
                .type(request.getMessageType())
                .content(request.getContent())
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .isUpdated(false)
                .isDeleted(false)
                .build();

            // Only a successfully persisted message can be acknowledged to the room.
            message = messageService.persistMessage(message);

            // Create response
            ChatMessageResponse response = ChatMessageResponse.builder()
                .id(message.getId())
                .tempId(request.getTempId())
                .chatRoomId(message.getChatRoomId())
                .senderId(message.getSenderId())
                .senderName(user.getName())
                .content(message.getContent())
                .type(message.getType())
                .createdAt(message.getCreatedAt())
                .updatedAt(message.getUpdatedAt())
                .isUpdated(message.isUpdated())
                .isDeleted(message.isDeleted())
                .build();

            messagingTemplate.convertAndSend("/topic/public/" + request.getRoomId(), response);
        } catch (Exception e) {
            logger.error("Error sending message", e);

            sendError(request, principal, "Failed to send message");
        }
    }

    @MessageMapping("/chat.addUser")
    public void addUser(@Valid @Payload ChatMessageRequest request, Principal principal) {
        if (principal == null) {
            return;
        }
        try {
            String userId = principal.getName();
            User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));

            if (!participantService.isUserParticipant(request.getRoomId(), userId)) {
                logger.warn("User {} attempted to join chat in room {} without being a participant", userId, request.getRoomId());
                sendError(request, principal, "Room membership required");
                return;
            }

            // Create join message
            ChatMessageResponse response = ChatMessageResponse.builder()
                .id(UUID.randomUUID().toString())
                .chatRoomId(request.getRoomId())
                .senderId(userId)
                .senderName(user.getName())
                .content(user.getName() + " joined the chat")
                .type(Message.MessageType.SYSTEM)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .isUpdated(false)
                .isDeleted(false)
                .build();

            // Broadcast join message
            messagingTemplate.convertAndSend("/topic/public/" + request.getRoomId(), response);
            
            logger.debug("User {} joined room {}", userId, request.getRoomId());

        } catch (Exception e) {
            logger.error("Error adding user to chat: ", e);
            sendError(request, principal, "Failed to add user to chat");
        }
    }

    @MessageExceptionHandler(MethodArgumentNotValidException.class)
    public void handleValidationFailure(MethodArgumentNotValidException exception, Principal principal) {
        ChatMessageRequest request = (ChatMessageRequest) exception.getBindingResult().getTarget();
        String detail = exception.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + " - " + error.getDefaultMessage())
            .collect(java.util.stream.Collectors.joining("; "));
        sendError(request, principal, "Validation failed: " + detail);
    }

    private void sendError(ChatMessageRequest request, Principal principal, String message) {
        if (principal == null) {
            return;
        }
        StompError error = StompError.builder()
            .tempId(request.getTempId())
            .message(message)
            .build();
        messagingTemplate.convertAndSendToUser(principal.getName(), "/queue/errors", error);
    }
}
