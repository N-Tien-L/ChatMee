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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.mongodb.test.autoconfigure.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.config.MongoConfig;
import com.lnt.chatmee.model.Reaction;
import com.lnt.chatmee.support.ContainersConfig;

@DataMongoTest
@ActiveProfiles("test")
@Import({ContainersConfig.class, MongoConfig.class})
class ReactionRepositoryIT {

    private static final String THUMBS = new String(Character.toChars(0x1F44D));
    private static final String HEART = new String(Character.toChars(0x2764));
    private static final Instant T0 = Instant.parse("2026-11-01T01:02:03Z");

    @Autowired private ReactionRepository reactions;
    private final String roomId = "room-" + UUID.randomUUID();
    private final String messageId = "msg-" + UUID.randomUUID();

    @AfterEach
    void cleanUp() {
        reactions.deleteByRoomId(roomId);
    }

    @Test
    void uniqueIndex_rejectsSecondReaction() {
        reactions.save(Reaction.builder().id(UUID.randomUUID().toString()).messageId(messageId).roomId(roomId)
                .userId("u1").emoji(THUMBS).createdAt(T0).build());
        assertThatThrownBy(() -> reactions.save(Reaction.builder().id(UUID.randomUUID().toString())
                .messageId(messageId).roomId(roomId).userId("u1").emoji(HEART).createdAt(T0).build()))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void react_replaceExisting_keepsOne() {
        reactions.setReaction(messageId, roomId, "u1", THUMBS, T0);
        reactions.setReaction(messageId, roomId, "u1", HEART, T0.plusSeconds(5));

        List<Reaction> rows = reactions.findPage(messageId, null, null, null, 10);
        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.getEmoji()).isEqualTo(HEART);
            assertThat(row.getCreatedAt()).isEqualTo(T0.plusSeconds(5));
            assertThat(row.getRoomId()).isEqualTo(roomId);
        });
    }

    @Test
    void react_sameEmoji_idempotent() {
        reactions.setReaction(messageId, roomId, "u1", THUMBS, T0);
        reactions.setReaction(messageId, roomId, "u1", THUMBS, T0.plusSeconds(9));

        assertThat(reactions.findPage(messageId, null, null, null, 10)).singleElement()
                .satisfies(row -> assertThat(row.getCreatedAt()).isEqualTo(T0));
    }

    @Test
    void react_delete_idempotent() {
        reactions.setReaction(messageId, roomId, "u1", THUMBS, T0);
        assertThat(reactions.deleteByMessageIdAndUserId(messageId, "u1")).isEqualTo(1);
        assertThat(reactions.deleteByMessageIdAndUserId(messageId, "u1")).isZero();
        assertThat(reactions.findByMessageIdAndUserId(messageId, "u1")).isEmpty();
    }

    @Test
    void react_concurrentPutsByOneUser_leaveOneRow() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < 16; i++) {
                String emoji = i % 2 == 0 ? THUMBS : HEART;
                futures.add(pool.submit(() -> {
                    start.await();
                    reactions.setReaction(messageId, roomId, "u1", emoji, Instant.now());
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> future : futures) {
                future.get(20, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(reactions.findPage(messageId, null, null, null, 10)).hasSize(1);
    }

    @Test
    void history_includesReactionSummary_tallyGroupsPerMessageAndEmoji() {
        String other = "msg-" + UUID.randomUUID();
        reactions.setReaction(messageId, roomId, "u1", THUMBS, T0.plusSeconds(2));
        reactions.setReaction(messageId, roomId, "u2", THUMBS, T0.plusSeconds(1));
        reactions.setReaction(messageId, roomId, "u3", HEART, T0.plusSeconds(3));
        reactions.setReaction(other, roomId, "u2", HEART, T0);

        List<ReactionTally> tallies = reactions.tally(List.of(messageId, other), "u1");

        assertThat(tallies).containsExactlyInAnyOrder(
                new ReactionTally(messageId, THUMBS, 2, T0.plusSeconds(1), 1),
                new ReactionTally(messageId, HEART, 1, T0.plusSeconds(3), 0),
                new ReactionTally(other, HEART, 1, T0, 0));
    }

    @Test
    void reactions_list_pagedAndFiltered() {
        reactions.setReaction(messageId, roomId, "u1", THUMBS, T0);
        reactions.setReaction(messageId, roomId, "u2", HEART, T0.plusSeconds(1));
        reactions.setReaction(messageId, roomId, "u3", HEART, T0.plusSeconds(1));
        reactions.setReaction(messageId, roomId, "u4", HEART, T0.plusSeconds(2));

        List<Reaction> first = reactions.findPage(messageId, HEART, null, null, 2);
        Reaction boundary = first.get(1);
        List<Reaction> second = reactions.findPage(messageId, HEART, boundary.getCreatedAt(), boundary.getId(), 2);

        List<String> users = new ArrayList<>();
        first.forEach(r -> users.add(r.getUserId()));
        second.forEach(r -> users.add(r.getUserId()));
        // Newest first, the tie at T0+1 split across pages without loss or repeat; the thumbs-up is filtered out.
        assertThat(users).hasSize(3).doesNotHaveDuplicates().contains("u2", "u3", "u4").doesNotContain("u1");
        assertThat(users.get(0)).isEqualTo("u4");
        assertThat(reactions.findPage(messageId, null, null, null, 10)).hasSize(4);
    }

    @Test
    void deleteRoom_removesReactions() {
        reactions.setReaction(messageId, roomId, "u1", THUMBS, T0);
        reactions.setReaction("msg-" + UUID.randomUUID(), roomId, "u2", HEART, T0);

        assertThat(reactions.deleteByRoomId(roomId)).isEqualTo(2);
        assertThat(reactions.findPage(messageId, null, null, null, 10)).isEmpty();
    }
}
