package com.lnt.chatmee.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Type;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.DispatcherServletAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.ServletWebServerFactoryAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.autoconfigure.websocket.servlet.WebSocketServletAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import org.springframework.web.socket.sockjs.client.SockJsClient;
import org.springframework.web.socket.sockjs.client.WebSocketTransport;

import com.lnt.chatmee.config.WebSocketConfig;

class AuthChannelInterceptorTest {
    private final WsTokenService tokens = mock(WsTokenService.class);
    private final AuthChannelInterceptor interceptor = new AuthChannelInterceptor(tokens);
    private final ExecutorSubscribableChannel channel = new ExecutorSubscribableChannel();

    @Test
    void preSend_missingToken_rejectsConnect() {
        assertThrows(BadCredentialsException.class, () -> interceptor.preSend(connect(null), channel));
        verifyNoInteractions(tokens);
    }

    @Test
    void preSend_stompHandshakeWithoutToken_rejectsConnect() {
        assertThrows(BadCredentialsException.class, () -> interceptor.preSend(frame(StompCommand.STOMP, null), channel));
        verifyNoInteractions(tokens);
    }

    @Test
    void preSend_validToken_removesTokenFromMessageHeaders() {
        when(tokens.consumeToken("valid-token")).thenReturn("internal-user");
        Message<?> message = connect("valid-token");
        interceptor.preSend(message, channel);
        assertNull(StompHeaderAccessor.wrap(message).getFirstNativeHeader("X-WS-Token"));
    }

    @Test
    void preSend_blankToken_rejectsConnect() {
        assertThrows(BadCredentialsException.class, () -> interceptor.preSend(connect(" "), channel));
        verifyNoInteractions(tokens);
    }

    @Test
    void preSend_invalidOrExpiredToken_rejectsConnect() {
        when(tokens.consumeToken("bad-token")).thenReturn(null);
        assertThrows(BadCredentialsException.class, () -> interceptor.preSend(connect("bad-token"), channel));
    }

    @Test
    void preSend_reusedToken_rejectsSecondConnect() {
        when(tokens.consumeToken("single-use")).thenReturn("internal-user").thenReturn(null);
        interceptor.preSend(connect("single-use"), channel);
        assertThrows(BadCredentialsException.class, () -> interceptor.preSend(connect("single-use"), channel));
        verify(tokens, times(2)).consumeToken("single-use");
    }

    @Test
    void preSend_validToken_setsInternalUserPrincipal() {
        when(tokens.consumeToken("valid-token")).thenReturn("internal-user");
        Message<?> message = connect("valid-token");
        assertSame(message, interceptor.preSend(message, channel));
        assertEquals("internal-user", StompHeaderAccessor.wrap(message).getUser().getName());
    }

    @Test
    void preSend_nonConnectFrames_passThrough() {
        for (StompCommand command : new StompCommand[]{StompCommand.SEND, StompCommand.SUBSCRIBE, StompCommand.DISCONNECT}) {
            Message<?> message = frame(command, null);
            assertSame(message, interceptor.preSend(message, channel));
        }
        verifyNoInteractions(tokens);
    }

    private Message<byte[]> connect(String token) {
        return frame(StompCommand.CONNECT, token);
    }

    private Message<byte[]> frame(StompCommand command, String token) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(command);
        if (token != null) {
            headers.setNativeHeader("X-WS-Token", token);
        }
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }

    // Exercises the real registered interceptor, broker and SockJS endpoint on loopback.
    // Redis is mocked here; the real Redis/Mongo Testcontainers gate belongs to CM-023.
    @Nested
    @SpringBootTest(classes = {WebSocketConfig.class, AuthChannelInterceptor.class},
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = "app.client.url=http://localhost")
    @ActiveProfiles("actuator-test")
    @ImportAutoConfiguration({ServletWebServerFactoryAutoConfiguration.class,
            DispatcherServletAutoConfiguration.class, WebMvcAutoConfiguration.class,
            WebSocketServletAutoConfiguration.class})
    class WireConnect {
        @LocalServerPort
        private int port;
        @MockitoBean
        private WsTokenService wireTokens;

        @Test
        void connect_missingToken_receivesErrorAndConnectionCloses() throws Exception {
            assertRejected(null);
            verifyNoInteractions(wireTokens);
        }

        @Test
        void connect_invalidOrExpiredToken_receivesErrorAndConnectionCloses() throws Exception {
            when(wireTokens.consumeToken("expired-token")).thenReturn(null);
            assertRejected("expired-token");
            verify(wireTokens).consumeToken("expired-token");
        }

        @Test
        void connect_validThenReusedToken_connectsOnceThenReceivesErrorAndCloses() throws Exception {
            when(wireTokens.consumeToken("single-use")).thenReturn("internal-user").thenReturn(null);
            WebSocketStompClient client = client();
            try {
                StompHeaders headers = new StompHeaders();
                headers.set("X-WS-Token", "single-use");
                StompSession session = client.connectAsync(url(), new WebSocketHttpHeaders(), headers, new StompSessionHandlerAdapter() {})
                        .get(5, TimeUnit.SECONDS);
                assertTrue(session.isConnected());
                session.disconnect();
            } finally {
                client.stop();
            }
            assertRejected("single-use");
            verify(wireTokens, times(2)).consumeToken("single-use");
        }

        private void assertRejected(String token) throws Exception {
            CompletableFuture<StompHeaders> error = new CompletableFuture<>();
            CompletableFuture<Throwable> closed = new CompletableFuture<>();
            WebSocketStompClient client = client();
            try {
                StompHeaders headers = new StompHeaders();
                if (token != null) headers.set("X-WS-Token", token);
                client.connectAsync(url(), new WebSocketHttpHeaders(), headers, new StompSessionHandlerAdapter() {
                    @Override
                    public Type getPayloadType(StompHeaders stompHeaders) {
                        return byte[].class;
                    }

                    @Override
                    public void handleFrame(StompHeaders stompHeaders, Object payload) {
                        error.complete(stompHeaders);
                    }

                    @Override
                    public void handleTransportError(StompSession session, Throwable exception) {
                        closed.complete(exception);
                    }
                });
                assertNotNull(error.get(5, TimeUnit.SECONDS).getFirst("message"));
                assertNotNull(closed.get(5, TimeUnit.SECONDS));
            } finally {
                client.stop();
            }
        }

        private WebSocketStompClient client() {
            WebSocketStompClient client = new WebSocketStompClient(new SockJsClient(
                    List.of(new WebSocketTransport(new StandardWebSocketClient()))));
            client.setDefaultHeartbeat(new long[]{0, 0});
            return client;
        }

        private String url() {
            return "http://127.0.0.1:" + port + "/ws";
        }
    }
}
