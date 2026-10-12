// File: backend/src/main/java/com/lnt/chatmee/controller/ChatWebSocketController.java
package com.lnt.chatmee.controller;

import java.security.Principal;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
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
    public void sendMessage(@Valid @Payload ChatMessageRequest request, Principal principal,
            @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String sessionId) {
        if (principal == null) {
            return;
        }
        ChatMessageResponse response;
        try {
            // Only a failure here means the message was not saved.
            response = messageService.sendMessage(request, principal.getName());
        } catch (com.lnt.chatmee.exception.DmRequestPendingException e) {
            sendError(sessionId, request, principal, ErrorCode.DM_REQUEST_PENDING, e.getMessage());
            return;
        } catch (com.lnt.chatmee.exception.ForbiddenActionException e) {
            sendError(sessionId, request, principal, ErrorCode.FORBIDDEN_ACTION, "Room membership required");
            return;
        } catch (Exception e) {
            // Exception messages in this path carry ids, never message content (security review NV-4).
            logger.error("Failed to send message to room {}", request.getRoomId(), e);
            sendError(sessionId, request, principal, ErrorCode.INTERNAL_ERROR, "Failed to send message");
            return;
        }
        broadcast(request.getRoomId(), response);
    }

    /**
     * Runs after the save. A failure here does not fail the send: the message is stored and the sender
     * sees it on the next resync (SPEC-008 AC-008-13). Only ids and the exception type are logged.
     */
    private void broadcast(String roomId, ChatMessageResponse response) {
        try {
            messagingTemplate.convertAndSend("/topic/rooms/" + roomId, response);
        } catch (RuntimeException e) {
            logger.warn("Saved message {} was not broadcast to room {}: {}",
                    response.id(), roomId, e.getClass().getSimpleName());
        }
    }

    @MessageExceptionHandler(MethodArgumentNotValidException.class)
    public void handleValidationFailure(MethodArgumentNotValidException exception, Principal principal,
            @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String sessionId) {
        ChatMessageRequest request = (ChatMessageRequest) exception.getBindingResult().getTarget();
        String detail = exception.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + " - " + error.getDefaultMessage())
            .collect(java.util.stream.Collectors.joining("; "));
        sendError(sessionId, request, principal, ErrorCode.VALIDATION_FAILED, "Validation failed: " + detail);
    }

    private void sendError(String sessionId, ChatMessageRequest request, Principal principal, ErrorCode code,
            String message) {
        if (principal == null || sessionId == null) {
            return;
        }
        StompError error = StompError.builder()
            .tempId(request == null ? null : request.getTempId())
            .code(code.name())
            .message(message)
            .build();
        messagingTemplate.convertAndSendToUser(principal.getName(), "/queue/errors", error,
                sessionHeaders(sessionId));
    }

    /** Targets the one STOMP session that sent the frame; other tabs of the user do not get the error. */
    static Map<String, Object> sessionHeaders(String sessionId) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setSessionId(sessionId);
        headers.setLeaveMutable(true);
        return headers.getMessageHeaders();
    }
}
