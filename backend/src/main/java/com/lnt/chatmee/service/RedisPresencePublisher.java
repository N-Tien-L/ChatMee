package com.lnt.chatmee.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class RedisPresencePublisher {

    private static final String PRESENCE_CHANNEL = "presence-channel";
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public RedisPresencePublisher(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public void publishPresenceUpdate(String userId, boolean isOnline) {
        try {
            Map<String, Object> message = Map.of("userId", userId, "online", isOnline);
            String jsonMessage = objectMapper.writeValueAsString(message);
            redisTemplate.convertAndSend(PRESENCE_CHANNEL, jsonMessage);
        } catch (JsonProcessingException e) {
            // In a real application, you'd want to handle this error more gracefully
            throw new RuntimeException("Could not serialize presence update to JSON", e);
        }
    }
}