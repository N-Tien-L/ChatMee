package com.lnt.chatmee.config;

import com.lnt.chatmee.security.WsSessionRegistry;
import org.springframework.boot.web.servlet.ServletListenerRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WsSessionConfig {
    @Bean
    public ServletListenerRegistrationBean<WsSessionRegistry> wsSessionListener(WsSessionRegistry registry) {
        return new ServletListenerRegistrationBean<>(registry);
    }
}
