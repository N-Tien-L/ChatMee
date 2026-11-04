package com.lnt.chatmee.security;

import com.lnt.chatmee.service.PresenceVisibilityService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.ExecutorChannelInterceptor;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Rechecks the recipient after executor queuing; subscribing to the topic grants no global audience. */
@Component
@RequiredArgsConstructor
public class PresenceSubscriptionInterceptor implements ExecutorChannelInterceptor {
    private final PresenceVisibilityService visibility;
    private final WsSessionRegistry sessions;
    private final ObjectMapper mapper;

    @Override
    public Message<?> beforeHandle(Message<?> message, MessageChannel channel, MessageHandler handler) {
        if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) != SimpMessageType.MESSAGE
                || !"/topic/presence".equals(SimpMessageHeaderAccessor.getDestination(message.getHeaders()))) return message;
        String viewer = sessions.userForSocket(SimpMessageHeaderAccessor.getSessionId(message.getHeaders()));
        if (viewer == null) return null;
        try {
            Object payload = message.getPayload();
            Map<?, ?> data = payload instanceof Map<?, ?> values ? values : payload instanceof byte[] bytes
                    ? mapper.readValue(bytes, new TypeReference<Map<String, Object>>() {}) : null;
            if (data == null || !(data.get("userId") instanceof String subject) || subject.isBlank()
                    || !(data.get("online") instanceof Boolean)) return null;
            return visibility.canSee(viewer, subject) ? message : null;
        } catch (JacksonException | DataAccessException unavailable) {
            return null;
        }
    }
}
