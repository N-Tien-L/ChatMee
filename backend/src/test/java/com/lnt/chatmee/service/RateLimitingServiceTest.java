package com.lnt.chatmee.service;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.lnt.chatmee.exception.ErrorCode;
import com.lnt.chatmee.exception.RateLimitExceededException;
import com.lnt.chatmee.service.RateLimitingService.DailyAction;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RateLimitingServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    private RateLimitingService rateLimitingService;
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        rateLimitingService = new RateLimitingService(redisTemplate, 20, 50, 20, 10);
        logs.start();
        ((Logger) LoggerFactory.getLogger(RateLimitingService.class)).addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(RateLimitingService.class)).detachAppender(logs);
    }

    @Test
    void check_publicFirstHit_setsExpiryAndAllows() {
        when(valueOperations.increment(anyString())).thenReturn(1L);

        RateLimitingService.Decision decision = rateLimitingService.check("ip:127.0.0.1", false);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.limit()).isEqualTo(RateLimitingService.MAX_REQUESTS_PER_MINUTE_PUBLIC);
        assertThat(decision.remaining()).isEqualTo(RateLimitingService.MAX_REQUESTS_PER_MINUTE_PUBLIC - 1);
        verify(redisTemplate).expire(anyString(), eq(60L), eq(TimeUnit.SECONDS));
    }

    @Test
    void check_customWindowOverLimit_deniesWithinThatWindow() {
        when(valueOperations.increment(anyString())).thenReturn(1L, 11L);

        RateLimitingService.Decision first = rateLimitingService.check("ws:user1:/app/chat.sendMessage", 10, 5);
        RateLimitingService.Decision eleventh = rateLimitingService.check("ws:user1:/app/chat.sendMessage", 10, 5);

        assertThat(first.allowed()).isTrue();
        assertThat(first.remaining()).isEqualTo(9);
        verify(redisTemplate).expire(org.mockito.ArgumentMatchers.startsWith("rate_limit:ws:user1:/app/chat.sendMessage:"),
                eq(5L), eq(TimeUnit.SECONDS));
        assertThat(eleventh.allowed()).isFalse();
        assertThat(eleventh.limit()).isEqualTo(10);
        assertThat(eleventh.retryAfterSeconds()).isBetween(1L, 5L);
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

    @Test
    void checkDailyAction_underDailyLimit_allowsAndExpiresKeyAtNextUtcMidnight() {
        when(valueOperations.increment("action:invitation:user1")).thenReturn(1L);

        assertThatCode(() -> rateLimitingService.checkDailyAction(DailyAction.INVITATION, "user1"))
                .doesNotThrowAnyException();

        verify(redisTemplate).expire(eq("action:invitation:user1"), anyLong(), eq(TimeUnit.SECONDS));
    }

    @Test
    void checkDailyAction_exactlyAtDailyLimit_allows() {
        when(valueOperations.increment("action:dm-request:user1")).thenReturn(20L);

        assertThatCode(() -> rateLimitingService.checkDailyAction(DailyAction.DM_REQUEST, "user1"))
                .doesNotThrowAnyException();
    }

    @Test
    void checkDailyAction_twentyFirstDmRequest_throwsRateLimitExceededWithRetryAfter() {
        when(valueOperations.increment("action:dm-request:user1")).thenReturn(21L);

        RateLimitExceededException error = catchThrowableOfType(
                () -> rateLimitingService.checkDailyAction(DailyAction.DM_REQUEST, "user1"),
                RateLimitExceededException.class);

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.RATE_LIMITED);
        assertThat(error.getRetryAfterSeconds()).isBetween(1L, 86_400L);
    }

    @Test
    void checkDailyAction_redisUnavailable_failsOpenAndLogsWarnWithoutContent() {
        when(valueOperations.increment("action:report:user1")).thenThrow(new RedisConnectionFailureException("down"));

        assertThatCode(() -> rateLimitingService.checkDailyAction(DailyAction.REPORT, "user1"))
                .doesNotThrowAnyException();

        assertThat(logs.list)
                .filteredOn(event -> event.getLevel() == Level.WARN)
                .singleElement()
                .satisfies(event -> assertThat(event.getFormattedMessage())
                        .contains("action=report", "userId=user1"));
    }
}
