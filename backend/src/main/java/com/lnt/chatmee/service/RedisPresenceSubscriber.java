package com.lnt.chatmee.service;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
public class RedisPresenceSubscriber implements MessageListener {

    private static final Logger logger = LoggerFactory.getLogger(RedisPresenceSubscriber.class);
    
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ObjectMapper objectMapper;

    public RedisPresenceSubscriber(SimpMessagingTemplate simpMessagingTemplate, ObjectMapper objectMapper) {
        this.simpMessagingTemplate = simpMessagingTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String jsonMessage = new String(message.getBody(), java.nio.charset.StandardCharsets.UTF_8);
            Map<String, Object> presenceUpdate = objectMapper.readValue(jsonMessage, new TypeReference<Map<String, Object>>() {});
            // use the injected simpMessagingTemplate to broadcast presence updates
            simpMessagingTemplate.convertAndSend("/topic/presence", (Object) presenceUpdate);
        } catch (JacksonException e) {
            logger.warn("Failed to parse presence update from Redis message");
        } catch (RuntimeException e) {
            logger.warn("Failed to forward presence update: {}", e.getClass().getSimpleName());
        }
    }
}
