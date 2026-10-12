package com.lnt.chatmee.service;

import com.lnt.chatmee.exception.RateLimitExceededException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/** Fixed window counters in Redis: one-minute request windows and per-user daily actions. Fails open when Redis is unavailable. */
@Service
public class RateLimitingService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitingService.class);

    static final int MAX_REQUESTS_PER_MINUTE_PUBLIC = 20;
    static final int MAX_REQUESTS_PER_MINUTE_AUTHENTICATED = 100;
    private static final long WINDOW_SECONDS = 60;
    private static final long SECONDS_PER_DAY = 86_400;

    private final StringRedisTemplate redisTemplate;
    private final int dailyRoomCreateLimit;
    private final int dailyInvitationLimit;
    private final int dailyDmRequestLimit;
    private final int dailyReportLimit;

    public RateLimitingService(StringRedisTemplate redisTemplate,
            @Value("${chatmee.rate-limit.daily.room-create:20}") int dailyRoomCreateLimit,
            @Value("${chatmee.rate-limit.daily.invitation:50}") int dailyInvitationLimit,
            @Value("${chatmee.rate-limit.daily.dm-request:20}") int dailyDmRequestLimit,
            @Value("${chatmee.rate-limit.daily.report:10}") int dailyReportLimit) {
        this.redisTemplate = redisTemplate;
        this.dailyRoomCreateLimit = dailyRoomCreateLimit;
        this.dailyInvitationLimit = dailyInvitationLimit;
        this.dailyDmRequestLimit = dailyDmRequestLimit;
        this.dailyReportLimit = dailyReportLimit;
    }

    public record Decision(boolean allowed, int limit, long remaining, long retryAfterSeconds) {}

    /** Actions with a per-user daily limit (SPEC-009 AC-009-29). */
    public enum DailyAction {
        ROOM_CREATE, INVITATION, DM_REQUEST, REPORT;

        String key() {
            return name().toLowerCase(Locale.ROOT).replace('_', '-');
        }
    }

    public Decision check(String key, boolean isAuthenticated) {
        int limit = isAuthenticated ? MAX_REQUESTS_PER_MINUTE_AUTHENTICATED : MAX_REQUESTS_PER_MINUTE_PUBLIC;
        return check(key, limit, WINDOW_SECONDS);
    }

    /** Counts one hit for {@code key} in a fixed window of {@code windowSeconds} and allows up to {@code limit}. */
    public Decision check(String key, int limit, long windowSeconds) {
        long now = Instant.now().getEpochSecond();
        String redisKey = "rate_limit:" + key + ":" + now / windowSeconds;

        Long count;
        try {
            count = redisTemplate.opsForValue().increment(redisKey);
            if (count != null && count == 1) {
                redisTemplate.expire(redisKey, windowSeconds, TimeUnit.SECONDS);
            }
        } catch (DataAccessException ex) {
            log.warn("Rate limiter unavailable, allowing request: {}", ex.getClass().getSimpleName());
            return new Decision(true, limit, limit, 0);
        }
        if (count == null) {
            log.warn("Rate limiter returned no counter, allowing request");
            return new Decision(true, limit, limit, 0);
        }

        long remaining = Math.max(0, limit - count);
        long retryAfter = windowSeconds - now % windowSeconds;
        return new Decision(count <= limit, limit, remaining, retryAfter);
    }

    /**
     * Counts one {@code action} by {@code userId} in the current UTC day and throws when the daily limit is exceeded.
     * The counter expires at the next UTC midnight. Fails open (WARN, no content logged) when Redis is unavailable.
     */
    public void checkDailyAction(DailyAction action, String userId) {
        int limit = dailyLimit(action);
        long now = Instant.now().getEpochSecond();
        long secondsUntilReset = SECONDS_PER_DAY - now % SECONDS_PER_DAY;
        String key = "action:" + action.key() + ":" + userId;

        Long count;
        try {
            count = redisTemplate.opsForValue().increment(key);
            if (count != null && count == 1) {
                redisTemplate.expire(key, secondsUntilReset, TimeUnit.SECONDS);
            }
        } catch (DataAccessException ex) {
            log.warn("Daily action limiter unavailable, allowing action={} userId={}", action.key(), userId);
            return;
        }
        if (count == null) {
            log.warn("Daily action limiter returned no counter, allowing action={} userId={}", action.key(), userId);
            return;
        }
        if (count > limit) {
            throw new RateLimitExceededException(secondsUntilReset);
        }
    }

    private int dailyLimit(DailyAction action) {
        return switch (action) {
            case ROOM_CREATE -> dailyRoomCreateLimit;
            case INVITATION -> dailyInvitationLimit;
            case DM_REQUEST -> dailyDmRequestLimit;
            case REPORT -> dailyReportLimit;
        };
    }
}
