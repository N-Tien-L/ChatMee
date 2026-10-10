package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

class StompMdcInterceptorTest {

    private final StompMdcInterceptor interceptor = new StompMdcInterceptor();
    private final MessageChannel channel = mock(MessageChannel.class);
    private final MessageHandler handler = mock(MessageHandler.class);

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void beforeHandle_frameWithUser_putsUserIdUntilHandled() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setUser(() -> "user-1");
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        interceptor.beforeHandle(message, channel, handler);
        assertThat(MDC.get("userId")).isEqualTo("user-1");

        interceptor.afterMessageHandled(message, channel, handler, null);
        assertThat(MDC.get("userId")).isNull();
    }

    @Test
    void beforeHandle_frameWithoutUser_leavesUserIdUnset() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        interceptor.beforeHandle(message, channel, handler);

        assertThat(MDC.get("userId")).isNull();
    }

    @Test
    void afterMessageHandled_handlerFailed_stillRemovesUserId() {
        MDC.put("userId", "user-1");
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0],
                StompHeaderAccessor.create(StompCommand.SEND).getMessageHeaders());

        interceptor.afterMessageHandled(message, channel, handler, new IllegalStateException("boom"));

        assertThat(MDC.get("userId")).isNull();
    }
}
