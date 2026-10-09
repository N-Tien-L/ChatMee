// File: backend/src/main/java/com/lnt/chatmee/controller/ChatWebSocketController.java
package com.lnt.chatmee.controller;

import java.security.Principal;

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
import com.lnt.chatmee.service.MessageService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@Controller
@Validated
@RequiredArgsConstructor
public class ChatWebSocketController {

    private static final Logger logger = LoggerFactory.getLogger(ChatWebSocketController.class);
    
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageService messageService;

    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Valid @Payload ChatMessageRequest request, Principal principal) {
        if (principal == null) {
            return;
        }
        try {
            ChatMessageResponse response = messageService.sendMessage(request, principal.getName());

            messagingTemplate.convertAndSend("/topic/public/" + request.getRoomId(), response);
        } catch (com.lnt.chatmee.exception.ForbiddenActionException e) {
            sendError(request, principal, "Room membership required");
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
            ChatMessageResponse response = messageService.addUser(request, userId);

            // Broadcast join message
            messagingTemplate.convertAndSend("/topic/public/" + request.getRoomId(), response);
            
            logger.debug("User {} joined room {}", userId, request.getRoomId());

        } catch (com.lnt.chatmee.exception.ForbiddenActionException e) {
            sendError(request, principal, "Room membership required");
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
