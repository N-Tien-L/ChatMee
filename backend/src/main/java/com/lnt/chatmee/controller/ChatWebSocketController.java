// File: backend/src/main/java/com/lnt/chatmee/controller/ChatWebSocketController.java
package com.lnt.chatmee.controller;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.MessageService;
import com.lnt.chatmee.service.ParticipantService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {

    private static final Logger logger = LoggerFactory.getLogger(ChatWebSocketController.class);
    
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageService messageService;
    private final UserRepository userRepository;
    private final ParticipantService participantService;

    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload ChatMessageRequest request, @Header("simpSessionAttributes") Map<String, Object> sessionAttributes) {
        logger.info("🔵 RECEIVED MESSAGE REQUEST: roomId={}, content={}, tempId={}, senderId={}", 
            request.getRoomId(), request.getContent(), request.getTempId(), request.getSenderId());
        try {
            // Get user from senderId in request (sent from frontend)
            String userId = request.getSenderId();
            if (userId == null || userId.isEmpty()) {
                logger.error("❌ SenderId is missing in request");
                return;
            }
            
            User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));

            // Verify user is participant of the room
            if (!participantService.isUserParticipant(request.getRoomId(), user.getId())) {
                logger.warn("User {} attempted to send message to room {} without being a participant", 
                    user.getId(), request.getRoomId());
                return;
            }

            // Create message object
            Message message = Message.builder()
                .id(UUID.randomUUID().toString())
                .chatRoomId(request.getRoomId())
                .senderId(user.getId())
                .type(request.getMessageType())
                .content(request.getContent())
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .isUpdated(false)
                .isDeleted(false)
                .build();

            // Create response
            ChatMessageResponse response = ChatMessageResponse.builder()
                .id(message.getId())
                .tempId(request.getTempId())
                .chatRoomId(message.getChatRoomId())
                .senderId(message.getSenderId())
                .senderName(user.getName())
                .content(message.getContent())
                .type(message.getType())
                .createdAt(message.getCreatedAt().toString())
                .updatedAt(message.getUpdatedAt().toString())
                .isUpdated(message.isUpdated())
                .isDeleted(message.isDeleted())
                .build();

            // STEP 1: Broadcast immediately (fast path - no I/O)
            logger.info("📤 BROADCASTING message: messageId={}, roomId={}", message.getId(), request.getRoomId());
            messagingTemplate.convertAndSend("/topic/public/" + request.getRoomId(), response);
            
            // STEP 2: Persist asynchronously (slow path - off the hot path)
            logger.info("🚀 CALLING persistMessageAsync: messageId={}", message.getId());
            messageService.persistMessageAsync(message);
            logger.info("✔️ RETURNED from persistMessageAsync (async in progress)");
            
        } catch (Exception e) {
            logger.error("❌ Error sending message: ", e);

            // Send error to room (can't use principal.getName() since it's null)
            StompError errorPayload = StompError.builder()
                .tempId(request.getTempId())
                .message("Failed to send message: " + e.getMessage())
                .build();
            
            // Broadcast error to the room
            messagingTemplate.convertAndSend("/topic/errors/" + request.getRoomId(), errorPayload);
        }
    }

    @MessageMapping("/chat.addUser")
    public void addUser(@Payload ChatMessageRequest request, @Header("simpSessionAttributes") Map<String, Object> sessionAttributes) {
        try {
            // Get user from senderId in request
            String userId = request.getSenderId();
            if (userId == null || userId.isEmpty()) {
                logger.error("❌ SenderId is missing in addUser request");
                return;
            }
            
            User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));

            // Create join message
            ChatMessageResponse response = ChatMessageResponse.builder()
                .id(UUID.randomUUID().toString())
                .chatRoomId(request.getRoomId())
                .senderId(user.getId())
                .senderName(user.getName())
                .content(user.getName() + " joined the chat")
                .type(Message.MessageType.SYSTEM)
                .createdAt(LocalDateTime.now().toString())
                .updatedAt(LocalDateTime.now().toString())
                .isUpdated(false)
                .isDeleted(false)
                .build();

            // Broadcast join message
            messagingTemplate.convertAndSend("/topic/public/" + request.getRoomId(), response);
            
            logger.info("User {} joined room {}", user.getName(), request.getRoomId());

        } catch (Exception e) {
            logger.error("Error adding user to chat: ", e);
        }
    }
}