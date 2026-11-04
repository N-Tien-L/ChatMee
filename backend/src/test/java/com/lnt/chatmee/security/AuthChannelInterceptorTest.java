package com.lnt.chatmee.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.webmvc.autoconfigure.DispatcherServletAutoConfiguration;
import org.springframework.boot.tomcat.autoconfigure.servlet.TomcatServletWebServerAutoConfiguration;
import org.springframework.boot.webmvc.autoconfigure.WebMvcAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import com.lnt.chatmee.config.WebSocketConfig;
import com.lnt.chatmee.dto.StompError;
import com.lnt.chatmee.service.ParticipantService;

class AuthChannelInterceptorTest {
    private final WsTokenService tokens = mock(WsTokenService.class);
    private final ParticipantService participants = mock(ParticipantService.class);
    private final AuthChannelInterceptor interceptor = new AuthChannelInterceptor(tokens, participants);
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
    void preSend_redisUnavailableAtConnect_rejectsWithoutTokenOrCause() {
        when(tokens.consumeToken("secret-token"))
                .thenThrow(new org.springframework.data.redis.RedisConnectionFailureException("Unable to connect to Redis"));

        AuthenticationServiceException error = assertThrows(AuthenticationServiceException.class,
                () -> interceptor.preSend(connect("secret-token"), channel));

        assertEquals("WebSocket authentication unavailable", error.getMessage());
        assertNull(error.getCause());
        assertFalse(error.getMessage().contains("secret-token"));
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
    void preSend_disconnectFrame_passesThrough() {
        for (StompCommand command : new StompCommand[]{StompCommand.DISCONNECT}) {
            Message<?> message = frame(command, null);
            assertSame(message, interceptor.preSend(message, channel));
        }
        verifyNoInteractions(tokens);
    }

    @Test
    void preSend_memberSubscription_allowsRoomMessagesAndTyping() {
        when(participants.isUserParticipant("room", "internal-user")).thenReturn(true);
        for (String destination : List.of("/topic/rooms/room", "/topic/rooms/room/typing")) {
            Message<?> message = applicationFrame(StompCommand.SUBSCRIBE, destination, "internal-user");
            assertSame(message, interceptor.preSend(message, channel));
        }
        verify(participants, times(2)).isUserParticipant("room", "internal-user");
    }

    @Test
    void preSend_nonMemberSubscription_deniesRoomMessagesAndTyping() {
        for (String destination : List.of("/topic/rooms/room", "/topic/rooms/room/typing")) {
            assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                    applicationFrame(StompCommand.SUBSCRIBE, destination, "internal-user"), channel));
        }
        verify(participants, times(2)).isUserParticipant("room", "internal-user");
    }

    @Test
    void preSend_authenticatedSubscription_allowsPresenceAndOwnErrorQueue() {
        for (String destination : List.of("/topic/presence", "/user/queue/errors")) {
            Message<?> message = applicationFrame(StompCommand.SUBSCRIBE, destination, "internal-user");
            assertSame(message, interceptor.preSend(message, channel));
        }
        verifyNoInteractions(participants);
        verify(tokens, times(2)).requireSocket(null);
        verifyNoMoreInteractions(tokens);
    }

    @Test
    void preSend_unknownOrMalformedSubscription_deniesByDefault() {
        for (String destination : List.of("/topic/unknown", "/topic/errors/room", "/queue/errors-user-other",
                "/user/other/queue/errors", "/topic/rooms/", "/topic/rooms/ /typing",
                "/topic/rooms/room/nested", "/topic/presence/extra", "/app/chat.sendMessage")) {
            assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                    applicationFrame(StompCommand.SUBSCRIBE, destination, "internal-user"), channel));
        }
        assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                applicationFrame(StompCommand.SUBSCRIBE, null, "internal-user"), channel));
        verifyNoInteractions(participants);
    }

    @Test
    void preSend_missingOrBlankPrincipal_deniesSubscribeAndSend() {
        for (StompCommand command : List.of(StompCommand.SUBSCRIBE, StompCommand.SEND)) {
            for (String userId : new String[]{null, " "}) {
                assertThrows(BadCredentialsException.class, () -> interceptor.preSend(
                        applicationFrame(command, "/topic/presence", userId), channel));
            }
        }
        verifyNoInteractions(participants, tokens);
    }

    @Test
    void preSend_knownApplicationSend_allowsControllerAuthorization() {
        for (String destination : List.of("/app/chat.sendMessage", "/app/rooms/room/typing", "/app/presence")) {
            Message<?> message = applicationFrame(StompCommand.SEND, destination, "internal-user");
            assertSame(message, interceptor.preSend(message, channel));
        }
        verifyNoInteractions(participants);
        verify(tokens, times(3)).requireSocket(null);
        verifyNoMoreInteractions(tokens);
    }

    @Test
    void preSend_brokerOrUnknownSend_deniesDirectPublication() {
        for (String destination : List.of("/topic/rooms/room", "/topic/rooms/room/typing", "/topic/presence",
                "/queue/errors", "/user/internal-user/queue/errors", "/app/unknown", "/app/chat.addUser")) {
            assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                    applicationFrame(StompCommand.SEND, destination, "internal-user"), channel));
        }
        assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                applicationFrame(StompCommand.SEND, null, "internal-user"), channel));
    }

    private Message<byte[]> applicationFrame(StompCommand command, String destination, String userId) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(command);
        headers.setDestination(destination);
        if (userId != null) headers.setUser(() -> userId);
        headers.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
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

    // Exercises the real registered interceptor, broker and WebSocket endpoint on loopback.
    // Redis is mocked here; the real Redis/Mongo Testcontainers gate belongs to CM-023.
    @Nested
    @SpringBootTest(classes = {WebSocketConfig.class, AuthChannelInterceptor.class, WsSessionRegistry.class},
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = "app.client.url=http://localhost")
    @ActiveProfiles("actuator-test")
    // Boot 4: the Tomcat auto-configuration also carries the WebSocket container setup.
    @ImportAutoConfiguration({TomcatServletWebServerAutoConfiguration.class,
            DispatcherServletAutoConfiguration.class, WebMvcAutoConfiguration.class})
    class WireConnect {
        @MockitoBean private org.springframework.data.redis.core.StringRedisTemplate wireRedis;
        @Autowired private WsSessionRegistry wireRegistry;
        @org.junit.jupiter.api.BeforeEach
        void bindSyntheticHttpSessions() {
            doAnswer(invocation -> {
                String token = invocation.getArgument(0), user = invocation.getArgument(1), socket = invocation.getArgument(2);
                wireRegistry.registerToken(token, user, new org.springframework.mock.web.MockHttpSession());
                wireRegistry.bindToken(token, user, socket);
                return null;
            }).when(wireTokens).bindSocket(anyString(), anyString(), anyString());
        }
        @LocalServerPort
        private int port;
        @MockitoBean
        private WsTokenService wireTokens;
        @Autowired @org.springframework.beans.factory.annotation.Qualifier("clientInboundChannel")
        private ExecutorSubscribableChannel wireInbound;
        @MockitoBean
        private ParticipantService wireParticipants;
        @Autowired
        private SimpMessagingTemplate wireMessaging;

        @Test
        void receiveOrder_subscribeBlocked_sendCannotOvertakeIt() throws Exception {
            when(wireTokens.consumeToken("ordered-token")).thenReturn("ordered-user");
            when(wireParticipants.isUserParticipant("ordered-room", "ordered-user")).thenReturn(true);
            var entered = new java.util.concurrent.CountDownLatch(1);
            var release = new java.util.concurrent.CountDownLatch(1);
            var sent = new java.util.concurrent.CountDownLatch(1);
            var probe = new org.springframework.messaging.support.ExecutorChannelInterceptor() {
                @Override public Message<?> beforeHandle(Message<?> message, org.springframework.messaging.MessageChannel channel,
                        org.springframework.messaging.MessageHandler handler) {
                    String destination = org.springframework.messaging.simp.SimpMessageHeaderAccessor.getDestination(message.getHeaders());
                    if ("/topic/rooms/ordered-room".equals(destination)) {
                        entered.countDown();
                        try { if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Subscription release deadline"); }
                        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return null; }
                    } else if ("/app/presence".equals(destination)) sent.countDown();
                    return message;
                }
            };
            WebSocketStompClient client = client();
            StompSession session = null;
            wireInbound.addInterceptor(probe);
            try {
                session = authenticatedSession(client, "ordered-token");
                session.subscribe("/topic/rooms/ordered-room", new StompSessionHandlerAdapter() {});
                session.send("/app/presence", "{}".getBytes(StandardCharsets.UTF_8));
                assertTrue(entered.await(5, TimeUnit.SECONDS), "Subscribe must reach the held real handler");
                assertFalse(sent.await(1, TimeUnit.SECONDS), "SEND overtook the held SUBSCRIBE");
                release.countDown();
                assertTrue(sent.await(5, TimeUnit.SECONDS), "SEND must continue after SUBSCRIBE is released");
            } finally {
                release.countDown(); wireInbound.removeInterceptor(probe);
                if (session != null && session.isConnected()) session.disconnect();
                client.stop();
            }
        }

        @Test
        void sendToUser_twoAuthenticatedSubscribers_deliversOnlyToTargetUser() throws Exception {
            when(wireTokens.consumeToken("token-a")).thenReturn("user-a");
            when(wireTokens.consumeToken("token-b")).thenReturn("user-b");
            WebSocketStompClient client = client();
            StompSession sessionA = null;
            StompSession sessionB = null;
            try {
                sessionA = authenticatedSession(client, "token-a");
                sessionB = authenticatedSession(client, "token-b");
                CompletableFuture<Void> readyA = new CompletableFuture<>();
                CompletableFuture<Void> readyB = new CompletableFuture<>();
                CompletableFuture<String> receivedA = new CompletableFuture<>();
                CompletableFuture<String> receivedB = new CompletableFuture<>();
                sessionA.subscribe("/user/queue/errors", errorHandler(readyA, receivedA));
                sessionB.subscribe("/user/queue/errors", errorHandler(readyB, receivedB));
                // The simple broker has no subscription receipts. Probe each private queue
                // until delivery proves both subscriptions are active, then send the error.
                CompletableFuture<Void> bothReady = CompletableFuture.allOf(readyA, readyB);
                for (int attempt = 0; attempt < 50 && !bothReady.isDone(); attempt++) {
                    wireMessaging.convertAndSendToUser("user-a", "/queue/errors", "ready");
                    wireMessaging.convertAndSendToUser("user-b", "/queue/errors", "ready");
                    try {
                        bothReady.get(100, TimeUnit.MILLISECONDS);
                    } catch (TimeoutException ignored) {
                        // Retry only the harmless readiness probe, within a five-second bound.
                    }
                }
                assertTrue(bothReady.isDone(), "Both private subscriptions must be active");
                wireMessaging.convertAndSendToUser("user-a", "/queue/errors",
                        StompError.builder().tempId("temp-a").message("sender-error").build());
                var error = new tools.jackson.databind.ObjectMapper().readTree(receivedA.get(5, TimeUnit.SECONDS));
                assertEquals("sender-error", error.get("message").asString());
                assertEquals("temp-a", error.get("tempId").asString());
                assertThrows(TimeoutException.class, () -> receivedB.get(300, TimeUnit.MILLISECONDS));
            } finally {
                if (sessionA != null && sessionA.isConnected()) sessionA.disconnect();
                if (sessionB != null && sessionB.isConnected()) sessionB.disconnect();
                client.stop();
            }
        }

        private StompSession authenticatedSession(WebSocketStompClient client, String token) throws Exception {
            StompHeaders headers = new StompHeaders();
            headers.set("X-WS-Token", token);
            return client.connectAsync(url(), new WebSocketHttpHeaders(), headers, new StompSessionHandlerAdapter() {})
                    .get(5, TimeUnit.SECONDS);
        }

        private StompSessionHandlerAdapter errorHandler(CompletableFuture<Void> ready, CompletableFuture<String> received) {
            return new StompSessionHandlerAdapter() {
                @Override
                public Type getPayloadType(StompHeaders stompHeaders) { return byte[].class; }
                @Override
                public void handleFrame(StompHeaders stompHeaders, Object payload) {
                    String value = new String((byte[]) payload, StandardCharsets.UTF_8);
                    if ("ready".equals(value)) ready.complete(null);
                    else received.complete(value);
                }
            };
        }

        @Test
        void subscribe_nonMemberRoom_receivesErrorAndConnectionCloses() throws Exception {
            when(wireTokens.consumeToken("subscriber-token")).thenReturn("user-b");
            CompletableFuture<StompHeaders> error = new CompletableFuture<>();
            CompletableFuture<Throwable> closed = new CompletableFuture<>();
            WebSocketStompClient client = client();
            try {
                StompHeaders headers = new StompHeaders();
                headers.set("X-WS-Token", "subscriber-token");
                StompSession session = client.connectAsync(url(), new WebSocketHttpHeaders(), headers,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public Type getPayloadType(StompHeaders stompHeaders) { return byte[].class; }
                            @Override
                            public void handleFrame(StompHeaders stompHeaders, Object payload) { error.complete(stompHeaders); }
                            @Override
                            public void handleTransportError(StompSession session, Throwable exception) { closed.complete(exception); }
                        }).get(5, TimeUnit.SECONDS);
                session.subscribe("/topic/rooms/room-a", new StompSessionHandlerAdapter() {});
                assertNotNull(error.get(5, TimeUnit.SECONDS).getFirst("message"));
                assertNotNull(closed.get(5, TimeUnit.SECONDS));
                verify(wireParticipants).isUserParticipant("room-a", "user-b");
            } finally {
                client.stop();
            }
        }

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

        @Test
        void handshake_foreignOrigin_rejectedByEndpointWithoutSecurityFilters() {
            // No Spring Security CORS filter in this context: the endpoint's own origin check must reject.
            WebSocketHttpHeaders handshake = new WebSocketHttpHeaders();
            handshake.setOrigin("https://evil.example");
            WebSocketStompClient client = client();
            try {
                CompletableFuture<StompSession> connection = client.connectAsync(
                        url(), handshake, new StompHeaders(), new StompSessionHandlerAdapter() {});
                ExecutionException failure = assertThrows(ExecutionException.class,
                        () -> connection.get(5, TimeUnit.SECONDS));
                assertTrue(stackTrace(failure).contains("[403]"), stackTrace(failure));
                verifyNoInteractions(wireTokens);
            } finally {
                client.stop();
            }
        }

        private String stackTrace(Throwable failure) {
            StringWriter out = new StringWriter();
            failure.printStackTrace(new PrintWriter(out));
            return out.toString();
        }

        private WebSocketStompClient client() {
            WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
            client.setDefaultHeartbeat(new long[]{0, 0});
            return client;
        }

        private String url() {
            return "ws://127.0.0.1:" + port + "/ws";
        }
    }

    @Test
    void preSend_userEventsSubscription_allowsOwnQueueOnly() {
        Message<?> message = applicationFrame(StompCommand.SUBSCRIBE, "/user/queue/events", "internal-user");
        assertSame(message, interceptor.preSend(message, channel));
        for (String destination : List.of("/user/queue/other", "/user/other/queue/events", "/queue/events", "/user/queue/events/extra")) {
            assertThrows(AccessDeniedException.class, () -> interceptor.preSend(
                applicationFrame(StompCommand.SUBSCRIBE, destination, "internal-user"), channel));
        }
        assertThrows(BadCredentialsException.class, () -> interceptor.preSend(
            applicationFrame(StompCommand.SUBSCRIBE, "/user/queue/events", null), channel));
        verifyNoInteractions(participants);
        verify(tokens, times(5)).requireSocket(null);
        verifyNoMoreInteractions(tokens);
    }

}
