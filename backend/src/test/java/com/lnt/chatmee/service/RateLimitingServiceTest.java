package com.lnt.chatmee.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
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
    void check_publicFirstHit_setsExpiryAndAllows() {
        when(valueOperations.increment(anyString())).thenReturn(1L);

        RateLimitingService.Decision decision = rateLimitingService.check("ip:127.0.0.1", false);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.limit()).isEqualTo(RateLimitingService.MAX_REQUESTS_PER_MINUTE_PUBLIC);
        assertThat(decision.remaining()).isEqualTo(RateLimitingService.MAX_REQUESTS_PER_MINUTE_PUBLIC - 1);
        verify(redisTemplate).expire(anyString(), eq(1L), eq(TimeUnit.MINUTES));
    }

    @Test
    void check_publicUnderLimit_allowsWithoutResettingExpiry() {
        when(valueOperations.increment(anyString())).thenReturn(5L);

        RateLimitingService.Decision decision = rateLimitingService.check("ip:127.0.0.1", false);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.remaining()).isEqualTo(15);
        verify(redisTemplate, never()).expire(anyString(), anyLong(), any());
    }

    @Test
    void check_publicOverLimit_deniesWithZeroRemainingAndRetryAfter() {
        when(valueOperations.increment(anyString())).thenReturn(21L);

        RateLimitingService.Decision decision = rateLimitingService.check("ip:127.0.0.1", false);

        assertThat(decision.allowed()).isFalse();
        assertThat(decision.remaining()).isZero();
        assertThat(decision.retryAfterSeconds()).isBetween(1L, 60L);
    }

    @Test
    void check_authenticatedUnderLimit_allows() {
        when(valueOperations.increment(anyString())).thenReturn(50L);

        RateLimitingService.Decision decision = rateLimitingService.check("user:user1", true);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.limit()).isEqualTo(RateLimitingService.MAX_REQUESTS_PER_MINUTE_AUTHENTICATED);
    }

    @Test
    void check_authenticatedOverLimit_denies() {
        when(valueOperations.increment(anyString())).thenReturn(101L);

        assertThat(rateLimitingService.check("user:user1", true).allowed()).isFalse();
    }

    @Test
    void check_redisUnavailable_failsOpen() {
        when(valueOperations.increment(anyString())).thenThrow(new RedisConnectionFailureException("down"));

        RateLimitingService.Decision decision = rateLimitingService.check("ip:127.0.0.1", false);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.remaining()).isEqualTo(RateLimitingService.MAX_REQUESTS_PER_MINUTE_PUBLIC);
    }

    @Test
    void check_nullCounter_failsOpen() {
        when(valueOperations.increment(anyString())).thenReturn(null);

        assertThat(rateLimitingService.check("ip:127.0.0.1", false).allowed()).isTrue();
    }
}
