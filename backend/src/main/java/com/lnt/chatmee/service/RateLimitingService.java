package com.lnt.chatmee.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class RateLimitingService {

    private final StringRedisTemplate redisTemplate;

    private static final int MAX_REQUESTS_PER_MINUTE_PUBLIC = 20;
    private static final int MAX_REQUESTS_PER_MINUTE_AUTHENTICATED = 100;

    public boolean isAllowed(String key, boolean isAuthenticated) {
        int maxRequests = isAuthenticated ? MAX_REQUESTS_PER_MINUTE_AUTHENTICATED : MAX_REQUESTS_PER_MINUTE_PUBLIC;
        String redisKey = "rate_limit:" + key + ":" + Instant.now().getEpochSecond() / 60;

        Long count = redisTemplate.opsForValue().increment(redisKey);
        
        if (count != null && count == 1) {
            redisTemplate.expire(redisKey, 1, TimeUnit.MINUTES);
        }

        return count != null && count <= maxRequests;
    }
}
