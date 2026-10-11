package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.AbstractSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.support.ContainersConfig;

// Same configuration as the other ITs, so the cached context and containers are reused.
@SpringBootTest
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class WsRateLimitIT {

    @Autowired
    @Qualifier("clientInboundChannel")
    private AbstractSubscribableChannel clientInboundChannel;

    @Autowired
    private WsRateLimitInterceptor interceptor;

    @Test
    void clientInboundChannel_registersRateLimitInterceptor() {
        assertThat(clientInboundChannel.getInterceptors()).contains(interceptor);
    }

    @Test
    void chatFrames_moreThanTenInOneWindow_dropsTheEleventh() {
        // Counted in the real Redis container. Retry if the 5 s window rolled over mid-burst.
        for (int attempt = 0; attempt < 3; attempt++) {
            String userId = "it-user-" + UUID.randomUUID();
            long windowBefore = Instant.now().getEpochSecond() / 5;
            int passed = 0;
            for (int i = 0; i < 10; i++) {
                if (interceptor.preSend(chatFrame(userId), clientInboundChannel) != null) {
                    passed++;
                }
            }
            Message<?> eleventh = interceptor.preSend(chatFrame(userId), clientInboundChannel);
            if (Instant.now().getEpochSecond() / 5 != windowBefore) {
                continue;
            }
            assertThat(passed).isEqualTo(10);
            assertThat(eleventh).isNull();
            return;
        }
        throw new AssertionError("The rate-limit window rolled over during every attempt");
    }

    private static Message<byte[]> chatFrame(String userId) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(StompCommand.SEND);
        headers.setDestination("/app/chat.sendMessage");
        headers.setUser(() -> userId);
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage("{\"tempId\":\"t\"}".getBytes(StandardCharsets.UTF_8),
                headers.getMessageHeaders());
    }
}
