package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.SubscribableChannel;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;

import com.lnt.chatmee.security.AuthChannelInterceptor;
import com.lnt.chatmee.security.RoomSubscriptionInterceptor;
import com.lnt.chatmee.security.WsSessionRegistry;

class WebSocketConfigTest {

    private static final long CLIENT_SILENCE_LIMIT_MS = 20_000; // stompjs closes after 2 x 10 s without server data
    private static final long NEGOTIATED_WRITE_INTERVAL_MS = 10_000;

    /** Opens up the protected accessor so the configured broker handler can be inspected. */
    private static final class InspectableRegistry extends MessageBrokerRegistry {
        InspectableRegistry() { super(mock(SubscribableChannel.class), mock(MessageChannel.class)); }
        SimpleBrokerMessageHandler broker() { return getSimpleBroker(mock(SubscribableChannel.class)); }
    }

    @Test
    void configureMessageBroker_serverHeartbeat_staysBelowClientSilenceLimit() {
        var config = new WebSocketConfig(mock(AuthChannelInterceptor.class), mock(WsSessionRegistry.class),
                mock(RoomSubscriptionInterceptor.class));
        var registry = new InspectableRegistry();

        config.configureMessageBroker(registry);

        long[] heartbeat = registry.broker().getHeartbeatValue();
        // The broker checks every min(values) ms and writes only once the negotiated interval has elapsed,
        // so the worst-case silence is the negotiated interval plus one check period.
        long checkPeriod = Math.min(heartbeat[0], heartbeat[1]);
        assertThat(NEGOTIATED_WRITE_INTERVAL_MS + checkPeriod).isLessThan(CLIENT_SILENCE_LIMIT_MS);
    }
}
