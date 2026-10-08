package com.lnt.chatmee.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RedisPresencePublisherTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private RedisPresencePublisher publisher;

    @Test
    void publishPresenceUpdate_successful_sendsToRedis() throws JsonProcessingException {
        when(objectMapper.writeValueAsString(any(Map.class))).thenReturn("{\"userId\":\"user1\",\"online\":true}");

        publisher.publishPresenceUpdate("user1", true);

        verify(redisTemplate).convertAndSend(RedisPresencePublisher.PRESENCE_CHANNEL, "{\"userId\":\"user1\",\"online\":true}");
    }

    @Test
    void publishPresenceUpdate_jsonException_throwsRuntimeException() throws JsonProcessingException {
        when(objectMapper.writeValueAsString(any(Map.class))).thenThrow(new JsonProcessingException("error") {});

        assertThatThrownBy(() -> publisher.publishPresenceUpdate("user1", true))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Could not serialize presence update to JSON");
    }
}
