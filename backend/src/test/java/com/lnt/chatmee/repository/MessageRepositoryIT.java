package com.lnt.chatmee.repository;

import static org.assertj.core.api.Assertions.assertThat;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.lnt.chatmee.config.MongoConfig;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.support.ContainersConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.mongodb.test.autoconfigure.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.ActiveProfiles;

@DataMongoTest
@ActiveProfiles("test")
@Import({ContainersConfig.class, MongoConfig.class})
class MessageRepositoryIT {
    @Autowired private MessageRepository messages;
    @Autowired private MongoTemplate mongo;
    private final List<String> insertedIds = new ArrayList<>();
    private final String roomId = UUID.randomUUID().toString();

    @AfterEach
    void cleanUp() {
        messages.deleteAllById(insertedIds);
    }

    @Test
    void findPage_sameCreatedAt_pagesWithoutGapsOrDuplicates() {
        // Mongo dates truncate nanoseconds; cursor boundaries must use the stored milliseconds.
        Instant time = Instant.parse("2026-10-09T01:02:03.123456789Z");
        Message oldA = save("old-a", time.minusSeconds(2), false);
        Message oldB = save("old-b", time.minusSeconds(1), false);
        Message sameA = save("same-a", time, false);
        Message sameB = save("same-b", time, false);
        Message sameC = save("same-c", time, false);
        Message sameD = save("same-d", time, false);
        Message newest = save("newest", time.plusSeconds(1), false);
        List<String> expectedDescending = List.of(newest.getId(), sameD.getId(), sameC.getId(),
                sameB.getId(), sameA.getId(), oldB.getId(), oldA.getId());

        for (int size : new int[]{1, 2, 3, 7}) {
            List<String> fetched = new ArrayList<>();
            List<Message> page = messages.findPage(roomId, PageRequest.of(0, size));
            for (int attempt = 0; !page.isEmpty() && attempt < 10; attempt++) {
                fetched.addAll(page.stream().map(Message::getId).toList());
                Message boundary = page.get(page.size() - 1);
                page = messages.findPageBefore(roomId, boundary.getCreatedAt(), boundary.getId(),
                        PageRequest.of(0, size));
            }
            assertThat(page).as("Pagination must reach an empty final page").isEmpty();
            assertThat(fetched).containsExactlyElementsOf(expectedDescending).doesNotHaveDuplicates();
        }
    }

    @Test
    void findPage_softDeletedMessages_areExcluded() {
        Instant time = Instant.parse("2026-10-09T01:02:03Z");
        Message oldest = save("oldest", time.minusSeconds(1), false);
        Message middle = save("middle", time, false);
        save("deleted-tie", time, true);
        save("deleted-newest", time.plusSeconds(2), true);
        Message newest = save("newest", time.plusSeconds(1), false);
        Message anotherRoom = Message.builder().id(UUID.randomUUID().toString()).chatRoomId("other-" + roomId)
                .createdAt(time).isDeleted(false).build();
        messages.save(anotherRoom);
        insertedIds.add(anotherRoom.getId());

        assertThat(messages.findPage(roomId, PageRequest.of(0, 100))).extracting(Message::getId)
                .containsExactly(newest.getId(), middle.getId(), oldest.getId());
        assertThat(messages.findPageBefore(roomId, time, middle.getId(), PageRequest.of(0, 100)))
                .extracting(Message::getId).containsExactly(oldest.getId());
    }

    @Test
    void findPage_objectIdMessages_usesStoredIdTypeAtTieBoundary() {
        Instant time = Instant.parse("2026-10-09T01:02:03Z");
        String firstId = new org.bson.types.ObjectId().toHexString();
        String secondId = new org.bson.types.ObjectId().toHexString();
        messages.save(Message.builder().id(firstId).chatRoomId(roomId).createdAt(time).isDeleted(false).build());
        messages.save(Message.builder().id(secondId).chatRoomId(roomId).createdAt(time).isDeleted(false).build());
        insertedIds.addAll(List.of(firstId, secondId));

        List<Message> first = messages.findPage(roomId, PageRequest.of(0, 1));
        assertThat(first).extracting(Message::getId).containsExactly(secondId);
        assertThat(messages.findPageBefore(roomId, time, secondId, PageRequest.of(0, 1)))
                .extracting(Message::getId).containsExactly(firstId);
    }

    @Test
    void findPage_mixedStringAndObjectIdIds_pagesWithoutGapsOrDuplicates() {
        Instant time = Instant.parse("2026-10-09T01:02:03Z");
        Message stringA = save("string-a", time, false);
        Message stringB = save("string-b", time, false);
        String objectA = new org.bson.types.ObjectId().toHexString();
        String objectB = new org.bson.types.ObjectId().toHexString();
        messages.save(Message.builder().id(objectA).chatRoomId(roomId).createdAt(time).isDeleted(false).build());
        messages.save(Message.builder().id(objectB).chatRoomId(roomId).createdAt(time).isDeleted(false).build());
        insertedIds.addAll(List.of(objectA, objectB));

        List<String> fetched = new ArrayList<>();
        List<Message> page = messages.findPage(roomId, PageRequest.of(0, 1));
        for (int attempt = 0; !page.isEmpty() && attempt < 5; attempt++) {
            Message boundary = page.get(0);
            fetched.add(boundary.getId());
            page = messages.findPageBefore(roomId, time, boundary.getId(), PageRequest.of(0, 1));
        }
        assertThat(page).isEmpty();
        // BSON sort places ObjectIds after strings, so descending pages cross this type boundary.
        assertThat(fetched).containsExactly(objectB, objectA, stringB.getId(), stringA.getId())
                .doesNotHaveDuplicates();
    }

    @Test
    void messages_startup_createsUniqueClientMessageIndex() {
        org.bson.Document index = mongo.getCollection("messages").listIndexes()
                .into(new ArrayList<>()).stream()
                .filter(document -> "messages_room_sender_client".equals(document.getString("name")))
                .findFirst().orElseThrow();
        assertThat(index.getBoolean("unique")).isTrue();
        assertThat(new ArrayList<>(index.get("key", org.bson.Document.class).keySet()))
                .containsExactly("chatRoomId", "senderId", "clientMessageId");
        assertThat(index.get("partialFilterExpression", org.bson.Document.class))
                .isEqualTo(new org.bson.Document("clientMessageId", new org.bson.Document("$exists", true)));
    }

    @Test
    void save_duplicateClientMessageIdInSameRoomAndSender_rejectsSecondRow() {
        String clientMessageId = UUID.randomUUID().toString();
        saveWithClientId(clientMessageId, "first");

        assertThatThrownBy(() -> saveWithClientId(clientMessageId, "second"))
                .isInstanceOf(DuplicateKeyException.class);
        assertThat(mongo.count(Query.query(Criteria.where("chatRoomId").is(roomId)), Message.class)).isEqualTo(1);
    }

    @Test
    void save_concurrentDuplicateClientMessageId_storesExactlyOneRow() throws Exception {
        String clientMessageId = UUID.randomUUID().toString();
        int attempts = 8;
        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < attempts; i++) {
                String suffix = "concurrent-" + i;
                results.add(pool.submit(() -> {
                    start.await();
                    try {
                        saveUntracked(clientMessageId, suffix);
                        return true;
                    } catch (DuplicateKeyException expected) {
                        return false;
                    }
                }));
            }
            start.countDown();
            int stored = 0;
            for (Future<Boolean> result : results) {
                if (result.get(10, TimeUnit.SECONDS)) stored++;
            }
            for (int i = 0; i < attempts; i++) insertedIds.add(roomId + ":concurrent-" + i);
            assertThat(stored).isEqualTo(1);
            assertThat(mongo.count(Query.query(Criteria.where("chatRoomId").is(roomId)), Message.class)).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void save_messagesWithoutClientMessageId_areNotConstrained() {
        saveWithClientId(null, "no-client-1");
        saveWithClientId(null, "no-client-2");
        assertThat(mongo.count(Query.query(Criteria.where("chatRoomId").is(roomId)), Message.class)).isEqualTo(2);
    }

    @Test
    void messages_startup_createsRoomTimeAndIdCompoundIndex() {
        org.bson.Document index = mongo.getCollection("messages").listIndexes()
                .into(new ArrayList<>()).stream()
                .filter(document -> "messages_room_created_id".equals(document.getString("name")))
                .findFirst().orElseThrow();
        assertThat(index.get("key", org.bson.Document.class))
                .isEqualTo(new org.bson.Document("chatRoomId", 1).append("createdAt", -1).append("_id", -1));
        assertThat(new ArrayList<>(index.get("key", org.bson.Document.class).keySet()))
                .containsExactly("chatRoomId", "createdAt", "_id");
    }

    private Message saveWithClientId(String clientMessageId, String suffix) {
        Message message = messages.save(clientMessage(clientMessageId, suffix));
        insertedIds.add(message.getId());
        return message;
    }

    /** Saves without registering the id for cleanup; used from worker threads. */
    private void saveUntracked(String clientMessageId, String suffix) {
        messages.save(clientMessage(clientMessageId, suffix));
    }

    private Message clientMessage(String clientMessageId, String suffix) {
        Instant time = Instant.parse("2026-10-09T01:02:03Z");
        return Message.builder().id(roomId + ":" + suffix).chatRoomId(roomId)
                .senderId("sender").clientMessageId(clientMessageId).content("Client id test")
                .type(Message.MessageType.TEXT).createdAt(time).updatedAt(time).build();
    }

    private Message save(String suffix, Instant time, boolean deleted) {
        Message message = messages.save(Message.builder().id(roomId + ":" + suffix).chatRoomId(roomId)
                .senderId("sender").content("Repository history test").type(Message.MessageType.TEXT)
                .createdAt(time).updatedAt(time).isDeleted(deleted).build());
        insertedIds.add(message.getId());
        return message;
    }

    @Test
    void membershipSystemMessages_persisted_appearInHistoryAndNeverCountUnread() {
        Instant marker = Instant.parse("2026-10-12T00:00:00Z");
        for (String text : List.of("Alice joined", "Alice left", "Bob removed Alice")) {
            var saved = messages.save(Message.builder().chatRoomId(roomId).senderId("SYSTEM")
                .content(text).type(Message.MessageType.SYSTEM).createdAt(marker.plusSeconds(1))
                .updatedAt(marker.plusSeconds(1)).isDeleted(false).build());
            insertedIds.add(saved.getId());
        }
        assertThat(messages.findPage(roomId, PageRequest.of(0, 100)))
            .extracting(Message::getContent).containsExactlyInAnyOrder("Alice joined", "Alice left", "Bob removed Alice");
        assertThat(messages.countUnread(roomId, "reader", marker)).isZero();
        save("text", marker.plusSeconds(2), false);
        assertThat(messages.countUnread(roomId, "reader", marker)).isEqualTo(1);
    }

}
