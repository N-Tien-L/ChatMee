package com.lnt.chatmee.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import com.lnt.chatmee.security.WsRateLimitInterceptor;

import lombok.RequiredArgsConstructor;

/**
 * Adds the per-user STOMP rate limit to the clientInboundChannel. Kept apart from WebSocketConfig so the
 * transport/authentication setup can be tested without Redis.
 */
@Configuration
@RequiredArgsConstructor
public class WsRateLimitConfig implements WebSocketMessageBrokerConfigurer {

    private final WsRateLimitInterceptor wsRateLimitInterceptor;

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(wsRateLimitInterceptor);
    }
}
