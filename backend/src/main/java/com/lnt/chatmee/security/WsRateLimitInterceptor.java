package com.lnt.chatmee.security;

import java.io.IOException;
import java.security.Principal;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.exception.ErrorCode;
import com.lnt.chatmee.service.RateLimitingService;

import lombok.RequiredArgsConstructor;

/**
 * Per-user rate limit for inbound STOMP SEND frames. The HTTP RateLimitingFilter never sees frames on an
 * open socket, so without this a member could flood a room. Over the limit the frame is dropped (not thrown:
 * a throw would close the whole connection); a dropped chat message also gets a private RATE_LIMITED error
 * carrying its tempId, while dropped typing and presence frames are discarded silently.
 */
@Component
@RequiredArgsConstructor
public class WsRateLimitInterceptor implements ChannelInterceptor {

    static final String CHAT_DESTINATION = "/app/chat.sendMessage";
    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();

    record Limit(int maxFrames, long windowSeconds) {}

    // Chat follows SPEC-007 (10 messages per 5 s per user). Typing frames are throttled by the client;
    // presence is sent on connect and every 30 s per tab.
    static final Map<String, Limit> LIMITS = Map.of(
            CHAT_DESTINATION, new Limit(10, 5),
            AuthChannelInterceptor.TYPING_DESTINATION_PATTERN, new Limit(10, 5),
            "/app/presence", new Limit(20, 60));

    private final RateLimitingService rateLimitingService;
    private final ObjectMapper objectMapper;
    // Resolved on use: the template is created by the broker configuration that registers this interceptor.
    private final ObjectProvider<SimpMessagingTemplate> messagingTemplate;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.SEND.equals(accessor.getCommand())) {
            return message;
        }
        String destination = accessor.getDestination();
        // All rooms share one typing bucket per user, so the route (not the concrete room) is the limit key.
        String route = destination != null && PATH_MATCHER.match(AuthChannelInterceptor.TYPING_DESTINATION_PATTERN, destination)
                ? AuthChannelInterceptor.TYPING_DESTINATION_PATTERN
                : destination;
        Limit limit = route == null ? null : LIMITS.get(route);
        Principal user = accessor.getUser();
        if (limit == null || user == null || user.getName() == null) {
            // Unknown destinations and anonymous frames are rejected by AuthChannelInterceptor.
            return message;
        }
        RateLimitingService.Decision decision = rateLimitingService.check(
                "ws:" + user.getName() + ":" + route, limit.maxFrames(), limit.windowSeconds());
        if (decision.allowed()) {
            return message;
        }
        if (CHAT_DESTINATION.equals(destination)) {
            StompError error = StompError.builder()
                    .tempId(readTempId(message.getPayload()))
                    .code(ErrorCode.RATE_LIMITED.name())
                    .message("Too many messages. Try again in " + decision.retryAfterSeconds() + " s")
                    .build();
            messagingTemplate.getObject().convertAndSendToUser(user.getName(), "/queue/errors", error);
        }
        return null;
    }

    private String readTempId(Object payload) {
        if (!(payload instanceof byte[] bytes)) {
            return null;
        }
        try {
            JsonNode tempId = objectMapper.readTree(bytes).get("tempId");
            return tempId != null && tempId.isTextual() ? tempId.asText() : null;
        } catch (IOException ex) {
            return null;
        }
    }
}
