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
    private final WsSessionRegistry sessionRegistry;

    public String issueToken(String userId, jakarta.servlet.http.HttpSession session) {
        if (userId == null || userRepository.findById(userId).isEmpty()) {
            throw new BadCredentialsException("Authenticated user not found");
        }
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redisTemplate.opsForValue().set(KEY_PREFIX + token, userId, TOKEN_TTL);
        try { sessionRegistry.registerToken(token, userId, session); }
        catch (BadCredentialsException invalid) {
            try { redisTemplate.delete(KEY_PREFIX + token); }
            catch (org.springframework.dao.DataAccessException unavailable) {
                // The local binding was rejected; the Redis key expires within the original TTL.
            }
            throw invalid;
        }
        return token;
    }

    public void bindSocket(String token, String userId, String socketId) {
        sessionRegistry.bindToken(token, userId, socketId);
    }

    public void requireSocket(String socketId) { sessionRegistry.requireSocket(socketId); }

    public String consumeToken(String token) {
        return redisTemplate.opsForValue().getAndDelete(KEY_PREFIX + token);
    }
}
