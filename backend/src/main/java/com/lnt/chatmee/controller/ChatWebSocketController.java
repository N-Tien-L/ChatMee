// File: backend/src/main/java/com/lnt/chatmee/controller/ChatWebSocketController.java
package com.lnt.chatmee.controller;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Controller;

import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.util.OAuthUtil;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {

    private static final Logger logger = LoggerFactory.getLogger(ChatWebSocketController.class);
    
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final ParticipantService participantService;
    private final OAuthUtil oAuthUtil;

    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload ChatMessageRequest request, Principal principal) {
        try {
            // Get authenticated user info
            OAuth2User oAuth2User = (OAuth2User) ((org.springframework.security.authentication.AbstractAuthenticationToken) principal).getPrincipal();
            String provider = oAuthUtil.determineProvider(oAuth2User);
            String providerId = oAuthUtil.getProviderId(oAuth2User, provider);
            
            User user = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElseThrow(() -> new RuntimeException("User not found"));

            // Verify user is participant of the room
            if (!participantService.isUserParticipant(request.getRoomId(), user.getId())) {
                logger.warn("User {} attempted to send message to room {} without being a participant", 
                    user.getId(), request.getRoomId());
                return;
            }

            // Create and save message
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

            Message savedMessage = messageRepository.save(message);

            // Create response
            ChatMessageResponse response = ChatMessageResponse.builder()
                .id(savedMessage.getId())
                .tempId(request.getTempId())
                .chatRoomId(savedMessage.getChatRoomId())
                .senderId(savedMessage.getSenderId())
                .senderName(user.getName())
                .content(savedMessage.getContent())
                .type(savedMessage.getType())
                .createdAt(savedMessage.getCreatedAt().toString())
                .updatedAt(savedMessage.getUpdatedAt().toString())
                .isUpdated(savedMessage.isUpdated())
                .isDeleted(savedMessage.isDeleted())
                .build();

            // Broadcast to room subscribers
            messagingTemplate.convertAndSend("/topic/public/" + request.getRoomId(), response);
            
            logger.info("Message sent to room {} by user {}", request.getRoomId(), user.getName());

        } catch (Exception e) {
            logger.error("Error sending message: ", e);

            // Send error to user-specific error queue 
            StompError errorPayload = StompError.builder()
                .tempId(request.getTempId())
                .message("Failed to send message: " + e.getMessage())
                .build();
            
            messagingTemplate.convertAndSendToUser(principal.getName(), "/queue/errors", errorPayload);
        }
    }

    @MessageMapping("/chat.addUser")
    public void addUser(@Payload ChatMessageRequest request, Principal principal) {
        try {
            // Get authenticated user info
            OAuth2User oAuth2User = (OAuth2User) ((org.springframework.security.authentication.AbstractAuthenticationToken) principal).getPrincipal();
            String provider = oAuthUtil.determineProvider(oAuth2User);
            String providerId = oAuthUtil.getProviderId(oAuth2User, provider);
            
            User user = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElseThrow(() -> new RuntimeException("User not found"));

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