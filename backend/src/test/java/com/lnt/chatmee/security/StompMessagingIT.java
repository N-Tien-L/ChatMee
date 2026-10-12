package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.support.ContainersConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.messaging.converter.StringMessageConverter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class StompMessagingIT {
    @LocalServerPort private int port;
    @Autowired private MongoTemplate mongo;
    @Autowired private StringRedisTemplate redis;
    @Autowired private WsTokenService tokens;
    @MockitoSpyBean private WsTokenService tokenService;
    @Autowired private SimpMessagingTemplate messaging;
    @Autowired private ObjectMapper mapper;
    @Value("${app.client.url}") private String clientUrl;

    private final List<User> users = new ArrayList<>();
    private final List<String> issuedTokens = new ArrayList<>();
    private final List<StompSession> sessions = new ArrayList<>();
    private String roomId;
    private WebSocketStompClient client;

    @BeforeEach
    void setUp() {
        roomId = UUID.randomUUID().toString();
        mongo.insert(ChatRoom.builder().id(roomId).name("Integration room")
                .type(ChatRoom.RoomType.PUBLIC).isActive(true).build());
        client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setDefaultHeartbeat(new long[]{0, 0});
        client.setMessageConverter(new org.springframework.messaging.converter.CompositeMessageConverter(List.of(
                new StringMessageConverter(), new org.springframework.messaging.converter.JacksonJsonMessageConverter())));
    }

    @AfterEach
    void cleanUp() {
        for (StompSession session : sessions) {
            if (session.isConnected()) session.disconnect();
        }
        client.stop();
        mongo.remove(Query.query(Criteria.where("chatRoomId").is(roomId)), Message.class);
        mongo.remove(Query.query(Criteria.where("chatRoomId").is(roomId)), Participant.class);
        mongo.remove(Query.query(Criteria.where("roomId").is(roomId)), com.lnt.chatmee.model.MembershipRequest.class);
        mongo.remove(Query.query(Criteria.where("id").is(roomId)), ChatRoom.class);
        for (User user : users) mongo.remove(user);
        for (String token : issuedTokens) redis.delete("ws-token:" + token);
    }

    @Test
    void connect_missingToken_receivesErrorAndCloses() throws Exception {
        assertRejected(null);
    }

    @Test
    void handshake_foreignOrigin_rejectedWith403() {
        WebSocketHttpHeaders handshake = new WebSocketHttpHeaders();
        handshake.setOrigin("https://evil.example");
        CompletableFuture<StompSession> connection = client.connectAsync(
                url(), handshake, headers(issueToken(seedUser(false))), new ProtocolEvents());
        assertThatThrownBy(() -> connection.get(10, TimeUnit.SECONDS))
                .hasStackTraceContaining("[403]");
    }

    @Test
    void handshake_clientOrigin_connectsWithToken() throws Exception {
        WebSocketHttpHeaders handshake = new WebSocketHttpHeaders();
        handshake.setOrigin(clientUrl);
        StompSession session = client.connectAsync(
                url(), handshake, headers(issueToken(seedUser(false))), new ProtocolEvents())
                .get(10, TimeUnit.SECONDS);
        sessions.add(session);
        assertThat(session.isConnected()).isTrue();
    }

    @Test
    void connect_reusedToken_receivesErrorAndCloses() throws Exception {
        String token = issueToken(seedUser(false));
        assertThat(redis.opsForValue().get("ws-token:" + token)).isEqualTo(users.get(0).getId());
        connect(token, new ProtocolEvents());
        assertThat(redis.hasKey("ws-token:" + token)).isFalse();
        assertRejected(token);
    }

    @Test
    void sendMessage_memberWithForgedSender_broadcastsAndPersistsPrincipalIdentity() throws Exception {
        User member = seedUser(true);
        StompSession session = connect(issueToken(member), new ProtocolEvents());
        BlockingQueue<String> broadcasts = subscribeReady(session, "/topic/rooms/" + roomId, null);
        String tempId = UUID.randomUUID().toString();
        sendJson(session, payload(tempId, "Integration message", "forged-user"));
        JsonNode response = mapper.readTree(take(broadcasts));
        assertThat(response.path("senderId").asString()).isEqualTo(member.getId());
        assertThat(response.path("senderName").asString()).isEqualTo(member.getName());
        assertThat(response.path("chatRoomId").asString()).isEqualTo(roomId);
        assertThat(response.path("tempId").asString()).isEqualTo(tempId);
        assertThat(response.path("content").asString()).isEqualTo("Integration message");
        assertThat(response.path("id").asString()).isNotBlank();
        assertThat(response.path("createdAt").asString()).endsWith("Z");
        java.time.Instant.parse(response.path("createdAt").asString());
        assertThat(response.has("isUpdated")).isTrue();
        assertThat(response.has("isDeleted")).isTrue();
        Message persisted = mongo.findById(response.path("id").asString(), Message.class);
        assertThat(persisted).isNotNull();
        // BSON dates retain milliseconds, while the wire Instant can retain nanoseconds.
        assertThat(persisted.getCreatedAt().toEpochMilli()).isEqualTo(
                java.time.Instant.parse(response.path("createdAt").asString()).toEpochMilli());
        assertThat(persisted.getSenderId()).isEqualTo(member.getId());
        assertThat(persisted.getChatRoomId()).isEqualTo(roomId);
        assertThat(persisted.getContent()).isEqualTo("Integration message");
        assertThat(persisted.getType()).isEqualTo(Message.MessageType.TEXT);
    }

    @Test
    void sendMessage_requestedDm_secondSenderMessageGetsDmRequestPendingAndRecipientReplyActivates() throws Exception {
        User sender = seedUser(true);
        User recipient = seedUser(false);
        String pairKey = com.lnt.chatmee.service.policy.DirectRoomPolicy.memberKey(sender.getId(), recipient.getId());
        mongo.updateFirst(Query.query(Criteria.where("id").is(roomId)), new org.springframework.data.mongodb.core.query.Update()
                .set("type", ChatRoom.RoomType.DIRECT_MESSAGE).set("state", com.lnt.chatmee.model.RoomState.REQUESTED)
                .set("maxParticipants", 2).set("memberCount", 1).set("memberKey", pairKey), ChatRoom.class);
        java.time.Instant now = java.time.Instant.now();
        mongo.insert(com.lnt.chatmee.model.MembershipRequest.builder()
                .kind(com.lnt.chatmee.model.MembershipRequestKind.DM_REQUEST).roomId(roomId)
                .inviterId(sender.getId()).targetUserId(recipient.getId())
                .status(com.lnt.chatmee.model.MembershipRequestStatus.PENDING).pairKey(pairKey)
                .createdAt(now).expiresAt(now.plus(java.time.Duration.ofDays(14))).build());
        StompSession senderSession = connect(issueToken(sender), new ProtocolEvents());
        BlockingQueue<String> senderErrors = subscribeReady(senderSession, "/user/queue/errors", sender.getId());
        BlockingQueue<String> roomFrames = subscribeReady(senderSession, "/topic/rooms/" + roomId, null);

        sendJson(senderSession, payload(UUID.randomUUID().toString(), "Hi, can we talk?", sender.getId()));
        assertThat(mapper.readTree(take(roomFrames)).path("content").asString()).isEqualTo("Hi, can we talk?");
        String secondTempId = UUID.randomUUID().toString();
        sendJson(senderSession, payload(secondTempId, "Hello?", sender.getId()));

        JsonNode error = mapper.readTree(take(senderErrors));
        assertThat(error.path("code").asString()).isEqualTo("DM_REQUEST_PENDING");
        assertThat(error.path("tempId").asString()).isEqualTo(secondTempId);
        assertThat(mongo.count(Query.query(Criteria.where("chatRoomId").is(roomId)), Message.class)).isEqualTo(1);

        StompSession recipientSession = connect(issueToken(recipient), new ProtocolEvents());
        sendJson(recipientSession, payload(UUID.randomUUID().toString(), "Sure", recipient.getId()));

        JsonNode reply = mapper.readTree(take(roomFrames));
        assertThat(reply.path("senderId").asString()).isEqualTo(recipient.getId());
        assertThat(reply.path("content").asString()).isEqualTo("Sure");
        ChatRoom activated = mongo.findById(roomId, ChatRoom.class);
        assertThat(activated.getState()).isEqualTo(com.lnt.chatmee.model.RoomState.ACTIVE);
        assertThat(activated.getMemberCount()).isEqualTo(2);
        assertThat(mongo.exists(Query.query(Criteria.where("chatRoomId").is(roomId).and("userId").is(recipient.getId())),
                Participant.class)).isTrue();
        assertThat(senderErrors.poll(1, TimeUnit.SECONDS)).isNull();
    }

    @Test
    void subscribe_nonMember_receivesErrorAndCloses() throws Exception {
        seedUser(true);
        ProtocolEvents events = new ProtocolEvents();
        StompSession session = connect(issueToken(seedUser(false)), events);
        session.subscribe("/topic/rooms/" + roomId, new ProtocolEvents());
        events.assertRejected();
    }

    @Test
    void sendMessage_oversizedContent_deliversPrivateErrorOnlyToSender() throws Exception {
        User sender = seedUser(true);
        User observer = seedUser(true);
        StompSession senderSession = connect(issueToken(sender), new ProtocolEvents());
        StompSession observerSession = connect(issueToken(observer), new ProtocolEvents());
        BlockingQueue<String> senderErrors = subscribeReady(senderSession, "/user/queue/errors", sender.getId());
        BlockingQueue<String> observerErrors = subscribeReady(observerSession, "/user/queue/errors", observer.getId());
        BlockingQueue<String> senderRoom = subscribeReady(senderSession, "/topic/rooms/" + roomId, null);
        BlockingQueue<String> observerRoom = subscribeReady(observerSession, "/topic/rooms/" + roomId, null);
        String tempId = UUID.randomUUID().toString();
        sendJson(senderSession, payload(tempId, "x".repeat(5001), observer.getId()));
        JsonNode error = mapper.readTree(take(senderErrors));
        assertThat(error.path("tempId").asString()).isEqualTo(tempId);
        assertThat(error.path("message").asString()).contains("Validation failed", "5000");
        assertThat(observerErrors.poll(1, TimeUnit.SECONDS)).isNull();
        assertThat(senderRoom.poll(1, TimeUnit.SECONDS)).isNull();
        assertThat(observerRoom.poll(1, TimeUnit.SECONDS)).isNull();
        assertThat(mongo.count(Query.query(Criteria.where("chatRoomId").is(roomId)), Message.class)).isZero();
        assertThat(senderSession.isConnected()).isTrue();
        assertThat(observerSession.isConnected()).isTrue();
    }

    @Test
    void sendMessage_twoSessionsOfOneUser_privateErrorReachesOnlySendingSession() throws Exception {
        User sender = seedUser(true);
        StompSession firstTab = connect(issueToken(sender), new ProtocolEvents());
        StompSession secondTab = connect(issueToken(sender), new ProtocolEvents());
        BlockingQueue<String> firstTabErrors = subscribeReady(firstTab, "/user/queue/errors", sender.getId());
        BlockingQueue<String> secondTabErrors = subscribeReady(secondTab, "/user/queue/errors", sender.getId());
        String tempId = UUID.randomUUID().toString();
        sendJson(firstTab, payload(tempId, "x".repeat(5001), sender.getId()));
        JsonNode error = mapper.readTree(take(firstTabErrors));
        assertThat(error.path("tempId").asString()).isEqualTo(tempId);
        assertThat(secondTabErrors.poll(1, TimeUnit.SECONDS)).isNull();
        assertThat(firstTab.isConnected()).isTrue();
        assertThat(secondTab.isConnected()).isTrue();
    }

    @Test
    void connect_redisUnavailableDuringTokenCheck_receivesErrorWithoutToken() throws Exception {
        String token = issueToken(seedUser(false));
        doThrow(new RedisConnectionFailureException("Unable to connect to Redis"))
                .when(tokenService).consumeToken(token);
        ProtocolEvents events = new ProtocolEvents();
        client.connectAsync(url(), new WebSocketHttpHeaders(), headers(token), events);
        events.assertRejected();
        assertThat(events.errorHeaders().getFirst("message")).isNotBlank().doesNotContain(token);
    }

    private User seedUser(boolean member) {
        String id = UUID.randomUUID().toString();
        User user = mongo.insert(User.builder().id(id).name("Integration user")
                .provider("google").providerId(id).build());
        users.add(user);
        if (member) mongo.insert(Participant.builder().id(UUID.randomUUID().toString())
                .chatRoomId(roomId).userId(id).role(Participant.Role.MEMBER).build());
        return user;
    }

    private String issueToken(User user) {
        String token = tokens.issueToken(user.getId());
        issuedTokens.add(token);
        return token;
    }

    private StompSession connect(String token, ProtocolEvents events) throws Exception {
        StompSession session = client.connectAsync(url(), new WebSocketHttpHeaders(), headers(token), events)
                .get(10, TimeUnit.SECONDS);
        sessions.add(session);
        assertThat(session.isConnected()).isTrue();
        return session;
    }

    private void assertRejected(String token) throws Exception {
        ProtocolEvents events = new ProtocolEvents();
        CompletableFuture<StompSession> connection = client.connectAsync(
                url(), new WebSocketHttpHeaders(), headers(token), events);
        events.assertRejected();
        assertThat(connection.isCompletedExceptionally()).isTrue();
    }

    private StompHeaders headers(String token) {
        StompHeaders headers = new StompHeaders();
        if (token != null) headers.set("X-WS-Token", token);
        return headers;
    }

    private String url() { return "ws://127.0.0.1:" + port + "/ws"; }

    private void sendJson(StompSession session, Map<String, Object> payload) {
        StompHeaders headers = new StompHeaders();
        headers.setDestination("/app/chat.sendMessage");
        headers.setContentType(org.springframework.util.MimeTypeUtils.APPLICATION_JSON);
        session.send(headers, payload);
    }

    private Map<String, Object> payload(String tempId, String content, String senderId) {
        return Map.of("roomId", roomId, "content", content,
                "messageType", "TEXT", "tempId", tempId, "senderId", senderId);
    }

    private BlockingQueue<String> subscribeReady(StompSession session, String destination, String userId)
            throws Exception {
        BlockingQueue<String> received = new LinkedBlockingQueue<>();
        BlockingQueue<String> readiness = new LinkedBlockingQueue<>();
        String probe = "subscription-ready:" + UUID.randomUUID();
        session.subscribe(destination, new StompSessionHandlerAdapter() {
            @Override public Type getPayloadType(StompHeaders headers) { return JsonNode.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) {
                JsonNode node = (JsonNode) payload;
                String value = node.path("subscriptionReady").asString();
                if (value.startsWith("subscription-ready:")) {
                    if (value.equals(probe)) readiness.add(value);
                } else {
                    received.add(node.toString());
                }
            }
        });
        // The simple broker does not support receipts. Delivery of a unique JSON probe
        // proves that this exact subscription is active before the application SEND.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            if (userId == null) messaging.convertAndSend(destination, (Object) Map.of("subscriptionReady", probe));
            else messaging.convertAndSendToUser(userId, "/queue/errors", Map.of("subscriptionReady", probe));
            if (probe.equals(readiness.poll(100, TimeUnit.MILLISECONDS))) return received;
        }
        throw new AssertionError("Subscription did not become ready: " + destination);
    }

    private String take(BlockingQueue<String> queue) throws Exception {
        String value = queue.poll(10, TimeUnit.SECONDS);
        assertThat(value).as("Expected STOMP payload within ten seconds").isNotNull();
        return value;
    }

    private static class ProtocolEvents extends StompSessionHandlerAdapter {
        private final CompletableFuture<StompHeaders> error = new CompletableFuture<>();
        private final CompletableFuture<Throwable> closed = new CompletableFuture<>();

        @Override public Type getPayloadType(StompHeaders headers) { return String.class; }
        @Override public void handleFrame(StompHeaders headers, Object payload) { error.complete(headers); }
        @Override public void handleTransportError(StompSession session, Throwable exception) { closed.complete(exception); }

        void assertRejected() throws Exception {
            assertThat(error.get(10, TimeUnit.SECONDS).getFirst("message")).isNotBlank();
            assertThat(closed.get(10, TimeUnit.SECONDS)).isNotNull();
        }

        StompHeaders errorHeaders() throws Exception {
            return error.get(10, TimeUnit.SECONDS);
        }
    }
}