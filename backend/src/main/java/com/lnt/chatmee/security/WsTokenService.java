package com.lnt.chatmee.security;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class WsTokenService {
    private static final String KEY_PREFIX = "ws-token:";
    private static final Duration TOKEN_TTL = Duration.ofSeconds(60);
    private final SecureRandom random = new SecureRandom();
    private final StringRedisTemplate redisTemplate;
    private final UserRepository userRepository;

    public String issueToken(String userId) {
        if (userId == null || userRepository.findById(userId).isEmpty()) {
            throw new BadCredentialsException("Authenticated user not found");
        }
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redisTemplate.opsForValue().set(KEY_PREFIX + token, userId, TOKEN_TTL);
        return token;
    }

    public String consumeToken(String token) {
        return redisTemplate.opsForValue().getAndDelete(KEY_PREFIX + token);
    }
}
