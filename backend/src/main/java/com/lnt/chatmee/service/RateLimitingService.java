package com.lnt.chatmee.service;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.TimeUnit;

/** Fixed one-minute window counter in Redis. Fails open when Redis is unavailable. */
@Service
@RequiredArgsConstructor
public class RateLimitingService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitingService.class);

    static final int MAX_REQUESTS_PER_MINUTE_PUBLIC = 20;
    static final int MAX_REQUESTS_PER_MINUTE_AUTHENTICATED = 100;
    private static final long WINDOW_SECONDS = 60;

    private final StringRedisTemplate redisTemplate;

    public record Decision(boolean allowed, int limit, long remaining, long retryAfterSeconds) {}

    public Decision check(String key, boolean isAuthenticated) {
        int limit = isAuthenticated ? MAX_REQUESTS_PER_MINUTE_AUTHENTICATED : MAX_REQUESTS_PER_MINUTE_PUBLIC;
        long now = Instant.now().getEpochSecond();
        String redisKey = "rate_limit:" + key + ":" + now / WINDOW_SECONDS;

        Long count;
        try {
            count = redisTemplate.opsForValue().increment(redisKey);
            if (count != null && count == 1) {
                redisTemplate.expire(redisKey, 1, TimeUnit.MINUTES);
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
        long retryAfter = WINDOW_SECONDS - now % WINDOW_SECONDS;
        return new Decision(count <= limit, limit, remaining, retryAfter);
    }
}
