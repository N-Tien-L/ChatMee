package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import com.lnt.chatmee.service.ParticipantService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

class RoomSubscriptionInterceptorTest {
    private final ParticipantService participants = mock(ParticipantService.class);
    private final RoomSubscriptionInterceptor interceptor = new RoomSubscriptionInterceptor(participants);
    private final ExecutorSubscribableChannel channel = new ExecutorSubscribableChannel();
    private final MessageHandler handler = message -> {};

    @BeforeEach
    void connect() {
        interceptor.onConnected(new SessionConnectedEvent(this,
                frame(SimpMessageType.CONNECT_ACK, null, "receiver-session", Map.of()), () -> "receiver"));
    }

    @Test
    void beforeHandle_roomAndTyping_rechecksReceivingUserOnEveryFrame() {
        when(participants.isUserParticipant("room", "receiver")).thenReturn(true, false, false);
        Message<?> room = frame(SimpMessageType.MESSAGE, "/topic/rooms/room", "receiver-session", Map.of());
        assertThat(deliver(room)).isSameAs(room);
        assertThat(deliver(room)).isNull();
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room/typing",
                "receiver-session", Map.of()))).isNull();
        verify(participants, times(3)).isUserParticipant("room", "receiver");
    }

    @Test
    void beforeHandle_outboundSenderPrincipal_authorizesReceiverInstead() {
        when(participants.isUserParticipant("room", "receiver")).thenReturn(true);
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setSessionId("receiver-session");
        headers.setDestination("/topic/rooms/room");
        headers.setUser(() -> "sender");
        Message<?> message = MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
        assertThat(deliver(message)).isSameAs(message);
        verify(participants).isUserParticipant("room", "receiver");
        verify(participants, never()).isUserParticipant("room", "sender");
    }

    @Test
    void beforeHandle_missingOrDisconnectedSession_dropsRoomFrames() {
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room", null, Map.of()))).isNull();
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room", "unknown", Map.of()))).isNull();
        interceptor.onDisconnected(new SessionDisconnectEvent(this,
                frame(SimpMessageType.DISCONNECT, null, "receiver-session", Map.of()),
                "receiver-session", org.springframework.web.socket.CloseStatus.NORMAL));
        interceptor.onDisconnected(new SessionDisconnectEvent(this,
                frame(SimpMessageType.DISCONNECT, null, "receiver-session", Map.of()),
                "receiver-session", org.springframework.web.socket.CloseStatus.NORMAL));
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room",
                "receiver-session", Map.of()))).isNull();
        verifyNoInteractions(participants);
    }

    @Test
    void beforeHandle_otherDestinationsAndControlFrames_passThrough() {
        for (String destination : List.of("/topic/presence", "/queue/errors-userreceiver-session",
                "/user/queue/errors")) {
            Message<?> message = frame(SimpMessageType.MESSAGE, destination, "receiver-session", Map.of());
            assertThat(deliver(message)).isSameAs(message);
        }
        Message<?> connected = frame(SimpMessageType.CONNECT_ACK, null, "receiver-session", Map.of());
        assertThat(deliver(connected)).isSameAs(connected);
        verifyNoInteractions(participants);
    }

    @Test
    void beforeHandle_malformedRoomTopics_failClosed() {
        for (String destination : List.of("/topic/rooms/", "/topic/rooms/ /typing", "/topic/rooms/room/nested")) {
            assertThat(deliver(frame(SimpMessageType.MESSAGE, destination, "receiver-session", Map.of()))).isNull();
        }
        verifyNoInteractions(participants);
    }

    @Test
    void beforeHandle_databaseFailure_dropsRoomFrameWithoutThrowing() {
        when(participants.isUserParticipant("room", "receiver"))
                .thenThrow(new DataAccessResourceFailureException("unavailable"));
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room",
                "receiver-session", Map.of()))).isNull();
    }

    @Test
    void beforeHandle_deletedEvent_onlySnapshotRecipientsReceiveIt() {
        Map<String, Object> marker = Map.of(RoomSubscriptionInterceptor.ROOM_DELETED_RECIPIENTS_HEADER,
                Set.of("receiver"));
        Message<?> deleted = frame(SimpMessageType.MESSAGE, "/topic/rooms/room", "receiver-session", marker);
        assertThat(deliver(deleted)).isSameAs(deleted);
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room", "receiver-session",
                Map.of(RoomSubscriptionInterceptor.ROOM_DELETED_RECIPIENTS_HEADER, Set.of("other"))))).isNull();
        // The marker cannot exempt typing or subsequent unmarked frames.
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room/typing",
                "receiver-session", marker))).isNull();
        assertThat(deliver(frame(SimpMessageType.MESSAGE, "/topic/rooms/room",
                "receiver-session", Map.of()))).isNull();
    }

    @Test
    void beforeHandle_nativeDeletedMarker_doesNotBypassMembership() {
        StompHeaderAccessor headers = StompHeaderAccessor.create(StompCommand.MESSAGE);
        headers.setSessionId("receiver-session");
        headers.setDestination("/topic/rooms/room");
        headers.setNativeHeader(RoomSubscriptionInterceptor.ROOM_DELETED_RECIPIENTS_HEADER, "receiver");
        assertThat(deliver(MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders()))).isNull();
        verify(participants).isUserParticipant("room", "receiver");
    }

    @Test
    void outboundChannel_frameQueuedBeforeLeave_checksMembershipAtHandlerTime() {
        Queue<Runnable> tasks = new ArrayDeque<>();
        ExecutorSubscribableChannel queued = new ExecutorSubscribableChannel(tasks::add);
        queued.addInterceptor(interceptor);
        AtomicInteger delivered = new AtomicInteger();
        queued.subscribe(message -> delivered.incrementAndGet());
        when(participants.isUserParticipant("room", "receiver")).thenReturn(true);
        queued.send(frame(SimpMessageType.MESSAGE, "/topic/rooms/room", "receiver-session", Map.of()));
        verifyNoInteractions(participants);
        when(participants.isUserParticipant("room", "receiver")).thenReturn(false);
        tasks.remove().run();
        assertThat(delivered.get()).isZero();
        verify(participants).isUserParticipant("room", "receiver");
    }

    private Message<?> deliver(Message<?> message) {
        return interceptor.beforeHandle(message, channel, handler);
    }

    private static Message<byte[]> frame(SimpMessageType type, String destination, String sessionId,
            Map<String, Object> extra) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(type);
        headers.setDestination(destination);
        headers.setSessionId(sessionId);
        extra.forEach(headers::setHeader);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }
}
