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
import com.lnt.chatmee.exception.ErrorCode;
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
            sendError(request, principal, ErrorCode.FORBIDDEN_ACTION, "Room membership required");
        } catch (Exception e) {
            // Exception messages in this path carry ids, never message content (security review NV-4).
            logger.error("Failed to send message to room {}", request.getRoomId(), e);
            sendError(request, principal, ErrorCode.INTERNAL_ERROR, "Failed to send message");
        }
    }

    @MessageExceptionHandler(MethodArgumentNotValidException.class)
    public void handleValidationFailure(MethodArgumentNotValidException exception, Principal principal) {
        ChatMessageRequest request = (ChatMessageRequest) exception.getBindingResult().getTarget();
        String detail = exception.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + " - " + error.getDefaultMessage())
            .collect(java.util.stream.Collectors.joining("; "));
        sendError(request, principal, ErrorCode.VALIDATION_FAILED, "Validation failed: " + detail);
    }

    private void sendError(ChatMessageRequest request, Principal principal, ErrorCode code, String message) {
        if (principal == null) {
            return;
        }
        StompError error = StompError.builder()
            .tempId(request == null ? null : request.getTempId())
            .code(code.name())
            .message(message)
            .build();
        messagingTemplate.convertAndSendToUser(principal.getName(), "/queue/errors", error);
    }
}
