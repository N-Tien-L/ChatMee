package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

import tools.jackson.databind.ObjectMapper;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.service.RateLimitingService;

class WsRateLimitInterceptorTest {

    private static final RateLimitingService.Decision ALLOWED = new RateLimitingService.Decision(true, 10, 9, 5);
    private static final RateLimitingService.Decision DENIED = new RateLimitingService.Decision(false, 10, 0, 3);

    private final RateLimitingService limits = mock(RateLimitingService.class);
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<SimpMessagingTemplate> messagingProvider = mock(ObjectProvider.class);
    private final MessageChannel channel = mock(MessageChannel.class);
    private final WsRateLimitInterceptor interceptor =
            new WsRateLimitInterceptor(limits, new ObjectMapper(), messagingProvider);

    @Test
    void preSend_chatUnderLimit_passesFrameAndCountsPerUserAndDestination() {
        when(limits.check(anyString(), anyInt(), anyLong())).thenReturn(ALLOWED);
        Message<byte[]> frame = frame(StompCommand.SEND, "/app/chat.sendMessage", "user-1", "{\"tempId\":\"t-1\"}");

        assertThat(interceptor.preSend(frame, channel)).isSameAs(frame);
        verify(limits).check("ws:user-1:/app/chat.sendMessage", 10, 5);
        verifyNoInteractions(messaging);
    }

    @Test
    void preSend_chatOverLimit_dropsFrameAndSendsRateLimitedErrorWithTempId() {
        when(limits.check(anyString(), anyInt(), anyLong())).thenReturn(DENIED);
        when(messagingProvider.getObject()).thenReturn(messaging);

        Message<?> result = interceptor.preSend(frame(StompCommand.SEND, "/app/chat.sendMessage", "user-1",
                "{\"roomId\":\"r\",\"tempId\":\"t-1\"}"), channel);

        assertThat(result).isNull();
        ArgumentCaptor<StompError> error = ArgumentCaptor.forClass(StompError.class);
        verify(messaging).convertAndSendToUser(eq("user-1"), eq("/queue/errors"), error.capture());
        assertThat(error.getValue().getTempId()).isEqualTo("t-1");
        assertThat(error.getValue().getCode()).isEqualTo("RATE_LIMITED");
        assertThat(error.getValue().getMessage()).contains("3 s");
    }

    @Test
    void preSend_chatOverLimitWithMalformedPayload_sendsErrorWithoutTempId() {
        when(limits.check(anyString(), anyInt(), anyLong())).thenReturn(DENIED);
        when(messagingProvider.getObject()).thenReturn(messaging);

        assertThat(interceptor.preSend(frame(StompCommand.SEND, "/app/chat.sendMessage", "user-1", "not json"),
                channel)).isNull();

        ArgumentCaptor<StompError> error = ArgumentCaptor.forClass(StompError.class);
        verify(messaging).convertAndSendToUser(eq("user-1"), eq("/queue/errors"), error.capture());
        assertThat(error.getValue().getTempId()).isNull();
    }

    @Test
    void preSend_typingOrPresenceOverLimit_dropsFrameSilently() {
        when(limits.check(anyString(), anyInt(), anyLong())).thenReturn(DENIED);

        assertThat(interceptor.preSend(frame(StompCommand.SEND, "/app/rooms/room-1/typing", "user-1", "{}"), channel)).isNull();
        assertThat(interceptor.preSend(frame(StompCommand.SEND, "/app/presence", "user-1", "{}"), channel)).isNull();

        verify(limits).check("ws:user-1:/app/rooms/*/typing", 10, 5);
        verify(limits).check("ws:user-1:/app/presence", 20, 60);
        verifyNoInteractions(messagingProvider, messaging);
    }

    @Test
    void preSend_nonSendFramesAndUnlistedDestinations_areNotCounted() {
        for (Message<byte[]> frame : List.of(
                frame(StompCommand.SUBSCRIBE, "/topic/rooms/room", "user-1", ""),
                frame(StompCommand.CONNECT, null, "user-1", ""),
                frame(StompCommand.SEND, "/app/unknown", "user-1", "{}"),
                frame(StompCommand.SEND, null, "user-1", "{}"))) {
            assertThat(interceptor.preSend(frame, channel)).isSameAs(frame);
        }
        verifyNoInteractions(limits, messagingProvider);
    }

    @Test
    void preSend_anonymousSend_isLeftToAuthentication() {
        Message<byte[]> frame = frame(StompCommand.SEND, "/app/chat.sendMessage", null, "{}");

        assertThat(interceptor.preSend(frame, channel)).isSameAs(frame);
        verifyNoInteractions(limits);
    }

    private static Message<byte[]> frame(StompCommand command, String destination, String userId, String body) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(command);
        if (destination != null) {
            headers.setDestination(destination);
        }
        if (userId != null) {
            headers.setUser(() -> userId);
        }
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(body.getBytes(StandardCharsets.UTF_8), headers.getMessageHeaders());
    }
}
