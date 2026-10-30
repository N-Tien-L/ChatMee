package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import java.io.IOException;
import java.time.Clock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

class WsSessionRegistryTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final Clock clock = mock(Clock.class);
    private final WsSessionRegistry registry = new WsSessionRegistry(redis, clock);
    @BeforeEach void setUp() { when(clock.millis()).thenReturn(1000L); }

    private HttpSession session(String id) {
        HttpSession result = mock(HttpSession.class);
        when(result.getId()).thenReturn(id);
        when(result.getLastAccessedTime()).thenReturn(1000L);
        when(result.getMaxInactiveInterval()).thenReturn(60);
        return result;
    }
    private WebSocketSession socket(String id) {
        WebSocketSession result = mock(WebSocketSession.class);
        when(result.getId()).thenReturn(id);
        when(result.isOpen()).thenReturn(true);
        registry.opened(result);
        return result;
    }
    private void connect(String token, String user, HttpSession http, WebSocketSession ws) {
        registry.registerToken(token, user, http);
        registry.bindToken(token, user, ws.getId());
    }
    @Test void sessionDestroyed_twoSocketsAndUnusedToken_revokesOnlyCurrentSession() throws Exception {
        HttpSession current = session("current"), independent = session("independent");
        WebSocketSession one = socket("one"), two = socket("two"), other = socket("other");
        connect("first", "same-user", current, one);
        connect("second", "same-user", current, two);
        connect("third", "same-user", independent, other);
        registry.registerToken("unused", "same-user", current);
        registry.sessionDestroyed(new HttpSessionEvent(current));
        verify(one).close(CloseStatus.POLICY_VIOLATION);
        verify(two).close(CloseStatus.POLICY_VIOLATION);
        verify(other, never()).close(any());
        assertThat(registry.userForSocket("one")).isNull();
        assertThat(registry.userForSocket("other")).isEqualTo("same-user");
        assertThatThrownBy(() -> registry.bindToken("unused", "same-user", "other")).isInstanceOf(BadCredentialsException.class);
        verify(redis).delete(java.util.List.of("ws-token:unused"));
    }
    @Test void registerToken_duringServletInvalidation_cannotRecreateBinding() {
        HttpSession http = session("ended");
        registry.sessionDestroyed(new HttpSessionEvent(http));
        assertThatThrownBy(() -> registry.registerToken("racing", "user", http)).isInstanceOf(BadCredentialsException.class);
    }
    @Test void sweep_idleDeadline_closesSocketWithoutRefreshingHttpSession() throws Exception {
        HttpSession http = session("idle");
        WebSocketSession ws = socket("idle-socket");
        connect("grant", "user", http, ws);
        when(clock.millis()).thenReturn(61_000L);
        assertThatThrownBy(() -> registry.requireSocket("idle-socket")).isInstanceOf(BadCredentialsException.class);
        registry.sweep();
        verify(ws).close(CloseStatus.POLICY_VIOLATION);
        verify(http, never()).setMaxInactiveInterval(anyInt());
        verify(http, never()).setAttribute(anyString(), any());
    }
    @Test void bindToken_expiredGrant_failsEvenIfHttpSessionIsLive() {
        HttpSession http = session("long-session");
        when(http.getMaxInactiveInterval()).thenReturn(3600);
        socket("socket");
        registry.registerToken("grant", "user", http);
        when(clock.millis()).thenReturn(61_000L);
        assertThatThrownBy(() -> registry.bindToken("grant", "user", "socket")).isInstanceOf(BadCredentialsException.class);
        registry.sweep();
    }
    @Test void bindToken_reusedOrWrongIdentityOrUnknownTransport_failsClosed() {
        HttpSession http = session("live");
        WebSocketSession ws = socket("socket");
        connect("valid", "user", http, ws);
        assertThatThrownBy(() -> registry.bindToken("valid", "user", "socket")).isInstanceOf(BadCredentialsException.class);
        registry.registerToken("wrong", "user", http);
        assertThatThrownBy(() -> registry.bindToken("wrong", "other", "socket")).isInstanceOf(BadCredentialsException.class);
        registry.registerToken("unknown", "user", http);
        assertThatThrownBy(() -> registry.bindToken("unknown", "user", "missing")).isInstanceOf(BadCredentialsException.class);
    }
    @Test void sessionIdChanged_reauthentication_revokesOldBindings() throws Exception {
        HttpSession http = session("old");
        WebSocketSession ws = socket("socket");
        connect("grant", "user", http, ws);
        when(http.getId()).thenReturn("new");
        registry.sessionIdChanged(new HttpSessionEvent(http), "old");
        verify(ws).close(CloseStatus.POLICY_VIOLATION);
        assertThat(registry.userForSocket("socket")).isNull();
    }
    @Test void sessionDestroyed_redisCleanupUnavailable_bindingsRemainRevoked() throws Exception {
        HttpSession http = session("current");
        WebSocketSession ws = socket("socket");
        connect("used", "user", http, ws);
        registry.registerToken("unused", "user", http);
        doThrow(new RedisConnectionFailureException("synthetic unavailable")).when(redis).delete(anyCollection());
        doThrow(new IOException("synthetic transport")).when(ws).close(any());
        registry.sessionDestroyed(new HttpSessionEvent(http));
        assertThat(registry.userForSocket("socket")).isNull();
        assertThatThrownBy(() -> registry.bindToken("unused", "user", "socket")).isInstanceOf(BadCredentialsException.class);
    }
    @Test void beforeHandle_endedSession_dropsAlreadyQueuedOutboundMessage() {
        HttpSession http = session("current");
        WebSocketSession ws = socket("socket");
        connect("used", "user", http, ws);
        var headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setSessionId("socket");
        Message<byte[]> frame = MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
        assertThat(registry.beforeHandle(frame, null, null)).isSameAs(frame);
        registry.sessionDestroyed(new HttpSessionEvent(http));
        assertThat(registry.beforeHandle(frame, null, null)).isNull();
        var error = SimpMessageHeaderAccessor.create(SimpMessageType.OTHER);
        Message<byte[]> rejection = MessageBuilder.createMessage(new byte[0], error.getMessageHeaders());
        assertThat(registry.beforeHandle(rejection, null, null)).isSameAs(rejection);
    }
    @Test void decorate_transportLifecycle_registersAndCleansOnlyOwnedSocket() throws Exception {
        WebSocketHandler delegate = mock(WebSocketHandler.class);
        WebSocketSession ws = mock(WebSocketSession.class);
        when(ws.getId()).thenReturn("socket");
        WebSocketHandler handler = registry.decorate(delegate);
        handler.afterConnectionEstablished(ws);
        connect("grant", "user", session("http"), ws);
        handler.afterConnectionClosed(ws, CloseStatus.NORMAL);
        assertThat(registry.userForSocket("socket")).isNull();
        verify(delegate).afterConnectionEstablished(ws);
        verify(delegate).afterConnectionClosed(ws, CloseStatus.NORMAL);
    }
    @Test void registerToken_invalidatedSession_failsClosed() {
        HttpSession http = session("expired");
        when(http.getCreationTime()).thenThrow(new IllegalStateException("invalid"));
        assertThatThrownBy(() -> registry.registerToken("grant", "user", http)).isInstanceOf(BadCredentialsException.class);
    }
}
