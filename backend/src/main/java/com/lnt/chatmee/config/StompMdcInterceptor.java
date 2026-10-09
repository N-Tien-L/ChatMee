package com.lnt.chatmee.config;

import java.security.Principal;

import org.slf4j.MDC;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.support.ExecutorChannelInterceptor;

/**
 * Adds the STOMP user's id to the logging MDC ({@code userId}) while an inbound frame is handled on the
 * clientInboundChannel executor thread, and removes it afterwards so pooled threads do not leak it.
 */
public final class StompMdcInterceptor implements ExecutorChannelInterceptor {

    @Override
    public Message<?> beforeHandle(Message<?> message, MessageChannel channel, MessageHandler handler) {
        Principal user = SimpMessageHeaderAccessor.getUser(message.getHeaders());
        if (user != null && user.getName() != null) {
            MDC.put(UserMdcFilter.MDC_KEY, user.getName());
        }
        return message;
    }

    @Override
    public void afterMessageHandled(Message<?> message, MessageChannel channel, MessageHandler handler, Exception ex) {
        MDC.remove(UserMdcFilter.MDC_KEY);
    }
}
