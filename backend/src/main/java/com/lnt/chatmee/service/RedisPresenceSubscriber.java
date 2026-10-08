package com.lnt.chatmee.service;

import java.io.IOException;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class RedisPresenceSubscriber implements MessageListener {

    private static final Logger logger = LoggerFactory.getLogger(RedisPresenceSubscriber.class);
    
    private final SimpMessagingTemplate simpMessagingTemplate;
    private final ObjectMapper objectMapper;
    private final PresenceService presenceService;

    public RedisPresenceSubscriber(SimpMessagingTemplate simpMessagingTemplate, ObjectMapper objectMapper, PresenceService presenceService) {
        this.simpMessagingTemplate = simpMessagingTemplate;
        this.objectMapper = objectMapper;
        this.presenceService = presenceService;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String jsonMessage = new String(message.getBody());
            Map<String, Object> presenceUpdate = objectMapper.readValue(jsonMessage, new TypeReference<Map<String, Object>>() {});
            String userId = (String) presenceUpdate.get("userId");
            Boolean isOnlineObj = (Boolean) presenceUpdate.get("online");
            boolean isOnline = isOnlineObj != null ? isOnlineObj : false;

            if (isOnline) {
                presenceService.userConnected(userId);
            } else {
                presenceService.userDisconnected(userId);
            }

            // use the injected simpMessagingTemplate to broadcast presence updates
            simpMessagingTemplate.convertAndSend("/topic/presence", presenceUpdate);
        } catch (IOException e) {
            logger.error("Failed to parse presence update from Redis message", e);
        } catch (Exception e) {
            logger.error("Unexpected error handling Redis presence message", e);
        }
    }
}
