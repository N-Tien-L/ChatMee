package com.lnt.chatmee.security;

import java.security.Principal;
import java.util.Set;

import org.springframework.dao.DataAccessException;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;

import com.lnt.chatmee.service.ParticipantService;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class AuthChannelInterceptor implements ChannelInterceptor {
    private static final Set<String> SEND_DESTINATIONS = Set.of(
            "/app/chat.sendMessage", "/app/presence");
    // Typing is sent to /app/rooms/{roomId}/typing; the controller checks membership for that room.
    static final String TYPING_DESTINATION_PATTERN = "/app/rooms/*/typing";
    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();
    private static final String ROOM_TOPIC_PREFIX = "/topic/rooms/";
    private static final String TYPING_SUFFIX = "/typing";
    private final WsTokenService wsTokenService;
    private final ParticipantService participantService;

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
            String userId = consumeToken(token);
            if (userId == null || userId.isBlank()) {
                throw new BadCredentialsException("Invalid or expired WebSocket token");
            }
            wsTokenService.bindSocket(token, userId, accessor.getSessionId());
            Principal principal = () -> userId;
            accessor.setUser(principal);
        }
        if (accessor != null && (StompCommand.SUBSCRIBE.equals(accessor.getCommand())
                || StompCommand.SEND.equals(accessor.getCommand()))) {
            Principal principal = accessor.getUser();
            if (principal == null || principal.getName() == null || principal.getName().isBlank()) {
                throw new BadCredentialsException("WebSocket authentication required");
            }
            wsTokenService.requireSocket(accessor.getSessionId());
            if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                authorizeSubscription(accessor.getDestination(), principal.getName());
            } else if (!isSendAllowed(accessor.getDestination())) {
                // Clients must use application handlers; direct broker sends bypass their checks.
                throw new AccessDeniedException("WebSocket destination not allowed");
            }
        }
        return message;
    }

    /**
     * A Redis outage at CONNECT fails closed with a fixed message. The Redis exception is not chained, so
     * neither its text nor the token can reach the ERROR frame or the log (SPEC-008 AC-008-16).
     */
    private String consumeToken(String token) {
        try {
            return wsTokenService.consumeToken(token);
        } catch (DataAccessException ex) {
            throw new AuthenticationServiceException("WebSocket authentication unavailable");
        }
    }

    private static boolean isSendAllowed(String destination) {
        return destination != null
                && (SEND_DESTINATIONS.contains(destination) || PATH_MATCHER.match(TYPING_DESTINATION_PATTERN, destination));
    }

    private void authorizeSubscription(String destination, String userId) {
        if ("/topic/presence".equals(destination) || "/user/queue/errors".equals(destination)
                || "/user/queue/events".equals(destination)) {
            return;
        }
        if (destination != null && destination.startsWith(ROOM_TOPIC_PREFIX)) {
            // /topic/rooms/{roomId} and /topic/rooms/{roomId}/typing share one membership rule.
            String path = destination.substring(ROOM_TOPIC_PREFIX.length());
            String roomId = path.endsWith(TYPING_SUFFIX)
                    ? path.substring(0, path.length() - TYPING_SUFFIX.length())
                    : path;
            if (!roomId.isBlank() && !roomId.contains("/")
                    && participantService.isUserParticipant(roomId, userId)) {
                return;
            }
        }
        throw new AccessDeniedException("WebSocket subscription not allowed");
    }
}
