package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.test.context.ActiveProfiles;
import com.lnt.chatmee.support.ContainersConfig;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ContainersConfig.class)
@ActiveProfiles("test")
class PresenceRegistryIT {
    @Autowired StringRedisTemplate redis;

    @Test
    void sessions_twoInstances_disconnectAndReconnectPublishOnlyTransitions() throws Exception {
        String prefix = "presence:{" + UUID.randomUUID() + "}:";
        PresenceService a = new PresenceService(redis, "A", prefix, 2000, 150);
        PresenceService b = new PresenceService(redis, "B", prefix, 2000, 150);
        var events = new CopyOnWriteArrayList<String>();
        RedisMessageListenerContainer subscriber = new RedisMessageListenerContainer();
        subscriber.setConnectionFactory(redis.getConnectionFactory());
        subscriber.addMessageListener((message, pattern) -> events.add(message.toString()),
                new ChannelTopic(RedisPresencePublisher.PRESENCE_CHANNEL));
        subscriber.afterPropertiesSet();
        subscriber.start();
        try {
            a.userConnected("user", "tab-a");
            a.userConnected("user", "tab-a"); // duplicate CONNECT must be idempotent
            b.userConnected("user", "tab-b");
            await().atMost(Duration.ofSeconds(2)).untilAsserted(() ->
                    assertThat(events).filteredOn(e -> e.contains("\"userId\":\"user\"" )).hasSize(1));
            a.userDisconnected("user", "tab-a");
            a.userDisconnected("user", "tab-a"); // duplicate DISCONNECT must not reset grace
            assertThat(a.getOnlineUsers()).containsExactly("user");
            assertThat(b.getOnlineUsers()).containsExactly("user");
            b.userDisconnected("user", "tab-b");
            assertThat(a.getOnlineUsers()).containsExactly("user");
            b.userConnected("user", "reload");
            await().pollDelay(Duration.ofMillis(200)).atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
                a.sweep();
                assertThat(events).filteredOn(e -> e.contains("\"userId\":\"user\"" )).hasSize(1);
            });
            b.userDisconnected("user", "reload");
            await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
                a.sweep();
                b.sweep();
                assertThat(a.getOnlineUsers()).isEmpty();
                assertThat(events).filteredOn(e -> e.contains("\"userId\":\"user\"" )).hasSize(2);
            });
            assertThat(events).anyMatch(e -> e.contains("\"online\":false"));
        } finally { subscriber.destroy(); }
    }

    @Test
    void sweep_expiredInstance_prunesSessionsWithoutDisconnect() {
        String prefix = "presence:{" + UUID.randomUUID() + "}:";
        PresenceService a = new PresenceService(redis, "A", prefix, 100, 100);
        PresenceService b = new PresenceService(redis, "B", prefix, 2000, 100);
        a.userConnected("crashed", "tab");
        b.userConnected("survivor", "tab");
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            b.sweep();
            assertThat(b.getOnlineUsers()).containsExactly("survivor");
        });
        assertThat(redis.hasKey(prefix + "sessions:crashed")).isFalse();
    }
    @Test
    void refresh_registryRecovery_removesStaleOwnedSessionsAndRestoresLiveOnes() {
        String prefix = "presence:{" + UUID.randomUUID() + "}:";
        PresenceService a = new PresenceService(redis, "A", prefix, 2000, 100);
        a.userConnected("stale", "closed");
        a.userDisconnected("stale", "closed");
        // Model a failed removal: Redis still contains the old owned session.
        redis.opsForHash().put(prefix + "sessions:stale", "A:closed", "A");
        a.userConnected("live", "tab");
        redis.delete(prefix + "sessions:live");
        a.refresh();
        assertThat(redis.opsForHash().size(prefix + "sessions:stale")).isZero();
        assertThat(redis.opsForHash().size(prefix + "sessions:live")).isEqualTo(1);
        a.heartbeat("live", "forged");
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() ->
                assertThat(a.getOnlineUsers()).containsExactly("live"));
    }

    @Test
    void sessions_concurrentInstances_preserveAllTabsAndLastSessionGrace() throws Exception {
        String prefix = "presence:{" + UUID.randomUUID() + "}:";
        PresenceService a = new PresenceService(redis, "A", prefix, 2000, 100);
        PresenceService b = new PresenceService(redis, "B", prefix, 2000, 100);
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> a.userConnected("parallel", "tab"));
            var second = executor.submit(() -> b.userConnected("parallel", "tab"));
            first.get();
            second.get();
            assertThat(redis.opsForHash().size(prefix + "sessions:parallel")).isEqualTo(2);
            first = executor.submit(() -> a.userDisconnected("parallel", "tab"));
            second = executor.submit(() -> b.userDisconnected("parallel", "tab"));
            first.get();
            second.get();
            assertThat(a.getOnlineUsers()).containsExactly("parallel");
            await().atMost(Duration.ofSeconds(2)).untilAsserted(() ->
                    assertThat(b.getOnlineUsers()).isEmpty());
        } finally { executor.shutdownNow(); }
    }

}
