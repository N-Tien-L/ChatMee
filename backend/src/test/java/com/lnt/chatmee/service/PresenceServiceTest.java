package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

class PresenceServiceTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final PresenceService service = new PresenceService(redis, "instance", "presence:{test}:", 30000, 10000);

    @Test
    void getOnlineUsers_sharedRegistry_returnsImmutableSnapshot() {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(List.of("remote"));
        assertThat(service.getOnlineUsers()).containsExactly("remote");
        assertThat(service.isUserOnline("remote")).isTrue();
        assertThatThrownBy(() -> service.getOnlineUsers().add("other")).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void sessions_redisDown_failOpenAndKeepOtherTabs() {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenThrow(new DataAccessResourceFailureException("unavailable"));
        service.userConnected("user", "tab1");
        service.userConnected("user", "tab2");
        service.userDisconnected("user", "tab1");
        assertThat(service.getOnlineUsers()).containsExactly("user");
        service.heartbeat("user", "tab2");
        service.sweep();
        service.userDisconnected("user", "tab2");
        service.userDisconnected("user", "tab2");
        assertThat(service.getOnlineUsers()).isEmpty();
    }

    @Test
    void heartbeat_unknownSession_cannotCreatePresence() {
        service.heartbeat("victim", "forged");
        service.userConnected(null, "session");
        service.userConnected("", "session");
        service.userConnected("user", null);
        service.userConnected("user", "");
        service.userDisconnected(null, null);
        verifyNoInteractions(redis);
    }

    @Test
    void refresh_missingResult_recoversOwnSessionsAndHandlesEmptyInstanceId() {
        PresenceService generated = new PresenceService(redis, "", "presence:{test}:", 30000, 10000);
        generated.userConnected("user", "tab");
        generated.refresh();
        assertThat(generated.getOnlineUsers()).containsExactly("user");
        generated.userDisconnected("user", "tab");
        assertThat(generated.getOnlineUsers()).isEmpty();
    }
}
