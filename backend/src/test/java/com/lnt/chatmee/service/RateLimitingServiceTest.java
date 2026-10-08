package com.lnt.chatmee.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RateLimitingServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @InjectMocks
    private RateLimitingService rateLimitingService;

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void isAllowed_publicFirstHit_setsExpiryAndReturnsTrue() {
        when(valueOperations.increment(anyString())).thenReturn(1L);

        boolean allowed = rateLimitingService.isAllowed("127.0.0.1", false);

        assertThat(allowed).isTrue();
        verify(redisTemplate).expire(anyString(), eq(1L), eq(TimeUnit.MINUTES));
    }

    @Test
    void isAllowed_publicUnderLimit_returnsTrue() {
        when(valueOperations.increment(anyString())).thenReturn(5L);

        boolean allowed = rateLimitingService.isAllowed("127.0.0.1", false);

        assertThat(allowed).isTrue();
        verify(redisTemplate, never()).expire(anyString(), anyLong(), any());
    }

    @Test
    void isAllowed_publicOverLimit_returnsFalse() {
        when(valueOperations.increment(anyString())).thenReturn(21L);

        boolean allowed = rateLimitingService.isAllowed("127.0.0.1", false);

        assertThat(allowed).isFalse();
    }

    @Test
    void isAllowed_authenticatedUnderLimit_returnsTrue() {
        when(valueOperations.increment(anyString())).thenReturn(50L);

        boolean allowed = rateLimitingService.isAllowed("user1", true);

        assertThat(allowed).isTrue();
    }

    @Test
    void isAllowed_authenticatedOverLimit_returnsFalse() {
        when(valueOperations.increment(anyString())).thenReturn(101L);

        boolean allowed = rateLimitingService.isAllowed("user1", true);

        assertThat(allowed).isFalse();
    }
}
