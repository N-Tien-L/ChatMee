package com.lnt.chatmee.config;

import com.lnt.chatmee.security.PresenceSubscriptionInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@RequiredArgsConstructor
public class PresenceWebSocketConfig implements WebSocketMessageBrokerConfigurer {
    private final PresenceSubscriptionInterceptor presenceAuthorization;
    @Override public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(presenceAuthorization);
    }
}
