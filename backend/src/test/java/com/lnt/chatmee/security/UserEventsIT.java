package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import tools.jackson.databind.JsonNode;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.support.ContainersConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

/** Real STOMP transport, Mongo persistence/membership and Redis authentication. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class UserEventsIT {
    @LocalServerPort private int port;
    @Autowired private MongoTemplate mongo;
    @Autowired private StringRedisTemplate redis;
    @Autowired private WsTokenService tokens;
    @Autowired private SimpMessagingTemplate messaging;
    @Autowired private ParticipantService participants;
    @Autowired private com.lnt.chatmee.service.MessageService messages;

    private final List<User> users = new ArrayList<>();
    private final List<String> roomIds = new ArrayList<>();
    private final List<String> issuedTokens = new ArrayList<>();
    private final List<StompSession> sessions = new ArrayList<>();
    private WebSocketStompClient client;
    private User owner;
    private User member;
    private String roomId;

    @BeforeEach
    void setUp() {
        owner = seedUser();
        member = seedUser();
        roomId = seedRoom(owner, member);
        client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setDefaultHeartbeat(new long[]{0, 0});
        client.setMessageConverter(new JacksonJsonMessageConverter());
    }

    @AfterEach
    void cleanUp() {
        for (StompSession session : sessions) {
            if (session.isConnected()) session.disconnect();
        }
        if (client != null) client.stop();
        for (String id : roomIds) {
            mongo.remove(Query.query(Criteria.where("chatRoomId").is(id)), Participant.class);
            mongo.remove(Query.query(Criteria.where("chatRoomId").is(id)), com.lnt.chatmee.model.Message.class);
            mongo.remove(Query.query(Criteria.where("id").is(id)), ChatRoom.class);
        }
        for (User user : users) mongo.remove(user);
        for (String token : issuedTokens) redis.delete("ws-token:" + token);
    }

    @Test
    void sendMessage_unopenedRoom_deliversActivityToAllMemberSessionsButNotNonMember() throws Exception {
        User outsider = seedUser();
        StompSession sender = connect(owner);
        StompSession reader = connect(member);
        StompSession readerTab = connect(member);
        StompSession stranger = connect(outsider);
        BlockingQueue<JsonNode> senderEvents = subscribeReady(sender, "/user/queue/events", owner.getId());
        BlockingQueue<JsonNode> events = subscribeReady(reader, "/user/queue/events", member.getId());
        BlockingQueue<JsonNode> tabEvents = subscribeReady(readerTab, "/user/queue/events", member.getId());
        BlockingQueue<JsonNode> outsiderEvents = subscribeReady(stranger, "/user/queue/events", outsider.getId());
        // No session subscribes to /topic/rooms/{id}; send through the real STOMP controller.
        sender.send("/app/chat.sendMessage", Map.of("roomId", roomId, "content", "hello unopened room", "messageType", "TEXT"));
        for (var queue : List.of(senderEvents, events, tabEvents)) {
            JsonNode event = take(queue);
            assertThat(event.path("type").asString()).isEqualTo("ROOM_ACTIVITY");
            JsonNode summary = event.path("payload").path("lastMessage");
            assertThat(event.path("payload").path("roomId").asString()).isEqualTo(roomId);
            assertThat(summary.path("senderId").asString()).isEqualTo(owner.getId());
            assertThat(summary.path("senderName").asString()).isEqualTo(owner.getName());
            assertThat(summary.path("preview").asString()).isEqualTo("hello unopened room");
            assertThat(mongo.findById(summary.path("id").asString(), com.lnt.chatmee.model.Message.class)).isNotNull();
            assertSilent(queue);
        }
        assertSilent(outsiderEvents);
    }

    @Test
    void sendMessage_systemMessage_deliversNoActivity() throws Exception {
        var queue = subscribeReady(connect(member), "/user/queue/events", member.getId());
        var request = new com.lnt.chatmee.dto.request.ChatMessageRequest();
        request.setRoomId(roomId); request.setContent("membership system message");
        request.setMessageType(com.lnt.chatmee.model.Message.MessageType.SYSTEM);
        messages.sendMessage(request, owner.getId());
        assertSilent(queue);
    }

    private User seedUser() {
        String id = UUID.randomUUID().toString();
        User user = mongo.insert(User.builder().id(id).name("User events test user")
                .provider("google").providerId(id).build());
        users.add(user);
        return user;
    }

    private String seedRoom(User creator, User roomMember) {
        String id = UUID.randomUUID().toString();
        mongo.insert(ChatRoom.builder().id(id).name("User events room").createdBy(creator.getId())
                .type(ChatRoom.RoomType.PUBLIC).isActive(true).memberCount(2).build());
        roomIds.add(id);
        participants.createParticipant(id, creator.getId(), Participant.Role.OWNER);
        participants.createParticipant(id, roomMember.getId(), Participant.Role.MEMBER);
        return id;
    }

    private StompSession connect(User user) throws Exception {
        String token = tokens.issueToken(user.getId(), new org.springframework.mock.web.MockHttpSession());
        issuedTokens.add(token);
        StompHeaders headers = new StompHeaders();
        headers.set("X-WS-Token", token);
        StompSession session = client.connectAsync("ws://127.0.0.1:" + port + "/ws",
                new WebSocketHttpHeaders(), headers, new StompSessionHandlerAdapter() {})
                .get(10, TimeUnit.SECONDS);
        sessions.add(session);
        return session;
    }

    private BlockingQueue<JsonNode> subscribeReady(StompSession session, String destination, String userId)
            throws Exception {
        BlockingQueue<JsonNode> received = new LinkedBlockingQueue<>();
        BlockingQueue<String> readiness = new LinkedBlockingQueue<>();
        String probe = "subscription-ready:" + UUID.randomUUID();
        session.subscribe(destination, new StompSessionHandlerAdapter() {
            @Override public Type getPayloadType(StompHeaders headers) { return JsonNode.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) {
                assertThat(headers.getFirst("chatmeeRoomDeletedRecipients")).isNull();
                JsonNode node = (JsonNode) payload;
                String value = node.path("subscriptionReady").asString();
                if (value.startsWith("subscription-ready:")) {
                    if (value.equals(probe)) readiness.add(value);
                } else received.add(node);
            }
        });
        // Simple broker receipts are unsupported; an exact probe proves subscription readiness.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            if (userId == null) messaging.convertAndSend(destination, (Object) Map.of("subscriptionReady", probe));
            else messaging.convertAndSendToUser(userId, "/queue/events", Map.of("subscriptionReady", probe));
            if (probe.equals(readiness.poll(100, TimeUnit.MILLISECONDS))) return received;
        }
        throw new AssertionError("Subscription did not become ready: " + destination);
    }

    private static JsonNode take(BlockingQueue<JsonNode> queue) throws Exception {
        JsonNode value = queue.poll(10, TimeUnit.SECONDS);
        assertThat(value).as("Expected STOMP payload within ten seconds").isNotNull();
        return value;
    }

    private static void assertSilent(BlockingQueue<JsonNode> queue) throws Exception {
        assertThat(queue.poll(500, TimeUnit.MILLISECONDS)).as("No event should be delivered").isNull();
    }

}
