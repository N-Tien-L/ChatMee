package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

/** Real STOMP broker/transport, REST leave/delete, Mongo membership and Redis tokens. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class SubscriptionRevocationIT {
    @LocalServerPort private int port;
    @Autowired private MongoTemplate mongo;
    @Autowired private StringRedisTemplate redis;
    @Autowired private WsTokenService tokens;
    @Autowired private SimpMessagingTemplate messaging;
    @Autowired private ParticipantService participants;
    @Autowired private MockMvc mvc;

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
            mongo.remove(Query.query(Criteria.where("id").is(id)), ChatRoom.class);
            mongo.remove(Query.query(Criteria.where("chatRoomId").is(id)), com.lnt.chatmee.model.Message.class);
        }
        for (User user : users) mongo.remove(user);
        for (String token : issuedTokens) redis.delete("ws-token:" + token);
    }

    @Test
    void leaveRoom_subscribedMember_stopsReceivingRoomAndTypingFrames() throws Exception {
        // Two tabs for the same Principal must both lose delivery without reconnecting.
        StompSession first = connect(member);
        StompSession second = connect(member);
        List<BlockingQueue<JsonNode>> revoked = new ArrayList<>();
        for (StompSession session : List.of(first, second)) {
            revoked.add(subscribeReady(session, topic(roomId), null));
            revoked.add(subscribeReady(session, topic(roomId) + "/typing", null));
        }
        StompSession observer = connect(owner);
        BlockingQueue<JsonNode> room = subscribeReady(observer, topic(roomId), null);
        BlockingQueue<JsonNode> typing = subscribeReady(observer, topic(roomId) + "/typing", null);

        leave(member);
        assertThat(take(room).path("content").asString()).isEqualTo(member.getName() + " left");
        publishRoomAndTyping("after-leave");

        assertThat(take(room).path("marker").asString()).isEqualTo("after-leave");
        assertThat(take(typing).path("marker").asString()).isEqualTo("after-leave");
        for (BlockingQueue<JsonNode> queue : revoked) assertSilent(queue);
        assertThat(first.isConnected()).isTrue();
        assertThat(second.isConnected()).isTrue();
    }

    @Test
    void leaveRoom_otherMembers_keepReceivingFrames() throws Exception {
        StompSession observer = connect(owner);
        BlockingQueue<JsonNode> room = subscribeReady(observer, topic(roomId), null);
        BlockingQueue<JsonNode> typing = subscribeReady(observer, topic(roomId) + "/typing", null);

        leave(member);
        assertThat(take(room).path("content").asString()).isEqualTo(member.getName() + " left");
        publishRoomAndTyping("still-member");

        assertThat(take(room).path("marker").asString()).isEqualTo("still-member");
        assertThat(take(typing).path("marker").asString()).isEqualTo("still-member");
        assertThat(observer.isConnected()).isTrue();
    }

    @Test
    void deleteRoom_subscribedMembers_receiveDeletedEventThenNothing() throws Exception {
        StompSession ownerSession = connect(owner);
        StompSession memberSession = connect(member);
        StompSession memberTab = connect(member);
        List<BlockingQueue<JsonNode>> rooms = new ArrayList<>();
        List<BlockingQueue<JsonNode>> typing = new ArrayList<>();
        for (StompSession session : List.of(ownerSession, memberSession, memberTab)) {
            rooms.add(subscribeReady(session, topic(roomId), null));
            typing.add(subscribeReady(session, topic(roomId) + "/typing", null));
        }
        BlockingQueue<JsonNode> presence = subscribeReady(memberSession, "/topic/presence", null);

        mvc.perform(delete("/api/v1/rooms/" + roomId).with(oauth2Login().oauth2User(principal(owner)))
                .with(csrf().asHeader())).andExpect(status().isOk());
        publishRoomAndTyping("after-delete");
        messaging.convertAndSend("/topic/presence", (Object) Map.of("marker", "connection-alive", "userId", member.getId(), "online", true));

        for (BlockingQueue<JsonNode> queue : rooms) {
            JsonNode deleted = take(queue);
            assertThat(deleted.path("type").asString()).isEqualTo("SYSTEM");
            assertThat(deleted.path("content").asString()).isEqualTo("This room has been deleted");
            assertThat(deleted.path("chatRoomId").asString()).isEqualTo(roomId);
            assertThat(deleted.path("id").isNull() || deleted.path("id").isMissingNode()).isTrue();
            assertThat(deleted.path("tempId").isNull() || deleted.path("tempId").isMissingNode()).isTrue();
            assertSilent(queue);
        }
        for (BlockingQueue<JsonNode> queue : typing) assertSilent(queue);
        awaitPresenceMarker(presence, "connection-alive");
        for (StompSession session : sessions) assertThat(session.isConnected()).isTrue();
    }

    @Test
    void leaveRoom_otherSubscriptions_keepWorking() throws Exception {
        String otherRoom = seedRoom(owner, member);
        StompSession session = connect(member);
        BlockingQueue<JsonNode> revoked = subscribeReady(session, topic(roomId), null);
        BlockingQueue<JsonNode> other = subscribeReady(session, topic(otherRoom), null);
        BlockingQueue<JsonNode> otherTyping = subscribeReady(session, topic(otherRoom) + "/typing", null);
        BlockingQueue<JsonNode> presence = subscribeReady(session, "/topic/presence", null);
        BlockingQueue<JsonNode> errors = subscribeReady(session, "/user/queue/errors", member.getId());

        leave(member);
        publishRoomAndTyping("revoked");
        messaging.convertAndSend(topic(otherRoom), (Object) Map.of("marker", "other-room"));
        messaging.convertAndSend(topic(otherRoom) + "/typing", (Object) Map.of("marker", "other-typing"));
        messaging.convertAndSend("/topic/presence", (Object) Map.of("marker", "presence", "userId", member.getId(), "online", true));
        messaging.convertAndSendToUser(member.getId(), "/queue/errors", Map.of("marker", "private-error"));

        assertThat(take(other).path("marker").asString()).isEqualTo("other-room");
        assertThat(take(otherTyping).path("marker").asString()).isEqualTo("other-typing");
        awaitPresenceMarker(presence, "presence");
        assertThat(take(errors).path("marker").asString()).isEqualTo("private-error");
        assertSilent(revoked);
        assertThat(session.isConnected()).isTrue();
    }

    @Test
    void membershipRemoved_outsideSocketInstance_stopsReceivingWithoutLocalInvalidation() throws Exception {
        StompSession session = connect(member);
        BlockingQueue<JsonNode> room = subscribeReady(session, topic(roomId), null);
        BlockingQueue<JsonNode> typing = subscribeReady(session, topic(roomId) + "/typing", null);
        // Simulate another instance writing the shared database: no local REST/service hook.
        mongo.remove(Query.query(Criteria.where("chatRoomId").is(roomId)
                .and("userId").is(member.getId())), Participant.class);
        publishRoomAndTyping("remote-leave");
        assertSilent(room);
        assertSilent(typing);
        assertThat(session.isConnected()).isTrue();
    }

    @Test
    void deleteRoom_previouslyLeftSubscriber_doesNotReceiveDeletedEvent() throws Exception {
        StompSession departed = connect(member);
        BlockingQueue<JsonNode> revoked = subscribeReady(departed, topic(roomId), null);
        leave(member);
        StompSession ownerSession = connect(owner);
        BlockingQueue<JsonNode> room = subscribeReady(ownerSession, topic(roomId), null);
        mvc.perform(delete("/api/v1/rooms/" + roomId).with(oauth2Login().oauth2User(principal(owner)))
                .with(csrf().asHeader())).andExpect(status().isOk());
        assertThat(take(room).path("type").asString()).isEqualTo("SYSTEM");
        assertSilent(revoked);
    }

    private void leave(User user) throws Exception {
        mvc.perform(delete("/api/v1/rooms/" + roomId + "/members/me")
                .with(oauth2Login().oauth2User(principal(user))).with(csrf().asHeader())).andExpect(status().isOk());
    }

    private UserPrincipal principal(User user) {
        return new UserPrincipal(user.getId(), "google", user.getProviderId(), user.getName(), Map.of(), List.of());
    }

    private User seedUser() {
        String id = UUID.randomUUID().toString();
        User user = mongo.insert(User.builder().id(id).name("Revocation test user")
                .provider("google").providerId(id).build());
        users.add(user);
        return user;
    }

    private String seedRoom(User creator, User roomMember) {
        String id = UUID.randomUUID().toString();
        mongo.insert(ChatRoom.builder().id(id).name("Revocation room").createdBy(creator.getId())
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

    private static String topic(String id) { return "/topic/rooms/" + id; }

    private void publishRoomAndTyping(String marker) {
        messaging.convertAndSend(topic(roomId), (Object) Map.of("marker", marker));
        messaging.convertAndSend(topic(roomId) + "/typing", (Object) Map.of("marker", marker));
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
            if ("/topic/presence".equals(destination)) messaging.convertAndSend(destination,
                    (Object) Map.of("subscriptionReady", probe, "userId", member.getId(), "online", true));
            else if (userId == null) messaging.convertAndSend(destination, (Object) Map.of("subscriptionReady", probe));
            else messaging.convertAndSendToUser(userId, destination.substring("/user".length()), Map.of("subscriptionReady", probe));
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
        assertThat(queue.poll(500, TimeUnit.MILLISECONDS)).as("Revoked topic must deliver no frame").isNull();
    }

    private static void awaitPresenceMarker(BlockingQueue<JsonNode> queue, String marker) throws Exception {
        // Redis presence fan-out from connection events can legitimately arrive after readiness.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            JsonNode value = queue.poll(100, TimeUnit.MILLISECONDS);
            if (value != null && value.has("marker")) {
                assertThat(value.path("marker").asString()).isEqualTo(marker);
                return;
            }
        }
        throw new AssertionError("Expected presence marker within ten seconds");
    }

    @Test
    void removeMember_subscribedTabs_receiveRemovedEventAndNoFurtherRoomFrames() throws Exception {
        List<BlockingQueue<JsonNode>> revoked = new ArrayList<>();
        List<BlockingQueue<JsonNode>> events = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            var session = connect(member);
            revoked.add(subscribeReady(session, topic(roomId), null));
            revoked.add(subscribeReady(session, topic(roomId) + "/typing", null));
            events.add(subscribeReady(session, "/user/queue/events", member.getId()));
        }
        var observer = connect(owner);
        var room = subscribeReady(observer, topic(roomId), null);
        var ownerEvents = subscribeReady(observer, "/user/queue/events", owner.getId());
        mvc.perform(delete("/api/v1/rooms/" + roomId + "/members/" + member.getId())
            .with(oauth2Login().oauth2User(principal(owner))).with(csrf().asHeader()))
            .andExpect(status().isNoContent());
        for (var queue : events) {
            var event = take(queue);
            assertThat(event.path("type").asString()).isEqualTo("ROOM_REMOVED");
            assertThat(event.path("payload").path("reason").asString()).isEqualTo("REMOVED");
            assertThat(event.path("payload").path("roomId").asString()).isEqualTo(roomId);
        }
        var announcement = take(room);
        assertThat(announcement.path("type").asString()).isEqualTo("SYSTEM");
        assertThat(announcement.path("content").asString()).isEqualTo(owner.getName() + " removed " + member.getName());
        assertThat(mongo.findById(announcement.path("id").asString(), com.lnt.chatmee.model.Message.class)).isNotNull();
        publishRoomAndTyping("after-removal");
        assertThat(take(room).path("marker").asString()).isEqualTo("after-removal");
        for (var queue : revoked) assertSilent(queue);
        assertSilent(ownerEvents);
        assertThat(participants.isUserParticipant(roomId, member.getId())).isFalse();
        for (var session : sessions) assertThat(session.isConnected()).isTrue();
    }

}
