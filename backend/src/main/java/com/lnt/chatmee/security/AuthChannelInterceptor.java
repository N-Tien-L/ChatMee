package com.lnt.chatmee.security;

import java.security.Principal;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class AuthChannelInterceptor implements ChannelInterceptor {
    private final WsTokenService wsTokenService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor != null && (StompCommand.CONNECT.equals(accessor.getCommand())
                || StompCommand.STOMP.equals(accessor.getCommand()))) {
            String token = accessor.getFirstNativeHeader("X-WS-Token");
            // Do not retain bearer tokens in message headers or framework error diagnostics.
            accessor.removeNativeHeader("X-WS-Token");
            if (token == null || token.isBlank()) {
                throw new BadCredentialsException("WebSocket authentication required");
            }
            String userId = wsTokenService.consumeToken(token);
            if (userId == null || userId.isBlank()) {
                throw new BadCredentialsException("Invalid or expired WebSocket token");
            }
            Principal principal = () -> userId;
            accessor.setUser(principal);
        }
        return message;
    }
}
