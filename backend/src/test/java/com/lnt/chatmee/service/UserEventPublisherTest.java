package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import com.lnt.chatmee.dto.event.*;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.model.Message.MessageType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@ExtendWith(MockitoExtension.class)
class UserEventPublisherTest {
    @Mock SimpMessagingTemplate messaging;

    @Test
    void lifecycleEvents_affectedUsers_deliverExpectedEnvelopeAndPayload() {
        var publisher = new UserEventPublisher(messaging);
        var room = ChatRoomResponse.builder().id("room").build();
        Instant before = Instant.now();
        publisher.roomAdded("alice", room);
        publisher.roomUpdated("bob", room);
        publisher.roomRemoved(Set.of("alice", "bob"), "room", "DELETED");
        var events = ArgumentCaptor.forClass(UserEvent.class);
        verify(messaging, times(2)).convertAndSendToUser(eq("alice"), eq("/queue/events"), events.capture());
        assertThat(events.getAllValues()).extracting(UserEvent::type).containsExactly("ROOM_ADDED", "ROOM_REMOVED");
        assertThat(events.getAllValues().get(0).payload()).isEqualTo(Map.of("room", room));
        assertThat(events.getAllValues().get(1).payload()).isEqualTo(new RoomRemovedPayload("room", "DELETED"));
        assertThat(events.getAllValues().get(0).occurredAt()).isBetween(before, Instant.now());
        verify(messaging, times(2)).convertAndSendToUser(eq("bob"), eq("/queue/events"), events.capture());
        assertThat(events.getAllValues().get(2).type()).isEqualTo("ROOM_UPDATED");
        assertThat(events.getAllValues().get(2).payload()).isEqualTo(Map.of("room", room));
        verifyNoMoreInteractions(messaging);
        var json = new tools.jackson.databind.json.JsonMapper().writeValueAsString(events.getAllValues().get(0));
        assertThat(json).contains("\"type\":\"ROOM_ADDED\"", "\"room\":", "\"occurredAt\":\"");
    }

    @Test
    void invitationEvents_inviteeAndInviter_deliverInvitationPayloads() {
        var publisher = new UserEventPublisher(messaging);
        var invitation = new com.lnt.chatmee.dto.response.InvitationResponse("inv",
            new com.lnt.chatmee.dto.response.InvitationResponse.RoomSummary("room", "Secret", 3),
            new com.lnt.chatmee.dto.response.UserSummaryResponse("alice", "Alice", null),
            new com.lnt.chatmee.dto.response.UserSummaryResponse("bob", "Bob", null), Instant.EPOCH, Instant.EPOCH);
        publisher.invitationReceived("bob", invitation);
        publisher.invitationChanged(Set.of("bob", "alice"), "inv", "room",
            com.lnt.chatmee.model.MembershipRequestStatus.ACCEPTED);
        var events = ArgumentCaptor.forClass(UserEvent.class);
        verify(messaging, times(2)).convertAndSendToUser(eq("bob"), eq("/queue/events"), events.capture());
        verify(messaging).convertAndSendToUser(eq("alice"), eq("/queue/events"), events.capture());
        assertThat(events.getAllValues()).extracting(UserEvent::type)
            .containsExactly("INVITATION_RECEIVED", "INVITATION_CHANGED", "INVITATION_CHANGED");
        assertThat(events.getAllValues().get(0).payload()).isEqualTo(Map.of("invitation", invitation));
        assertThat(events.getAllValues().get(1).payload()).isEqualTo(Map.of("invitationId", "inv", "roomId", "room",
            "status", com.lnt.chatmee.model.MembershipRequestStatus.ACCEPTED));
        verifyNoMoreInteractions(messaging);
        var json = new tools.jackson.databind.json.JsonMapper().writeValueAsString(events.getAllValues().get(1));
        assertThat(json).contains("\"type\":\"INVITATION_CHANGED\"", "\"status\":\"ACCEPTED\"");
    }

    @Test
    void dmRequestReceived_recipient_deliversRequestPayload() {
        var publisher = new UserEventPublisher(messaging);
        var request = new com.lnt.chatmee.dto.response.DmRequestResponse("dm",
            new com.lnt.chatmee.dto.response.UserSummaryResponse("alice", "Alice", null), "hi", Instant.EPOCH,
            Instant.EPOCH);
        publisher.dmRequestReceived("bob", request);
        var events = ArgumentCaptor.forClass(UserEvent.class);
        verify(messaging).convertAndSendToUser(eq("bob"), eq("/queue/events"), events.capture());
        verifyNoMoreInteractions(messaging);
        assertThat(events.getValue().type()).isEqualTo("DM_REQUEST_RECEIVED");
        assertThat(events.getValue().payload()).isEqualTo(Map.of("request", request));
        var json = new tools.jackson.databind.json.JsonMapper().writeValueAsString(events.getValue());
        assertThat(json).contains("\"type\":\"DM_REQUEST_RECEIVED\"", "\"roomId\":\"dm\"",
            "\"createdAt\":\"1970-01-01T00:00:00Z\"");
    }

    @Test
    void roomActivity_textMessage_sendsBoundedPreviewToEveryMemberOnly() {
        var publisher = new UserEventPublisher(messaging);
        var message = ChatMessageResponse.builder().id("saved").chatRoomId("room").senderId("alice")
            .senderName("Alice").content("😀".repeat(101)).type(MessageType.TEXT).createdAt(Instant.EPOCH).build();
        publisher.roomActivity(Set.of("alice", "bob"), message);
        var events = ArgumentCaptor.forClass(UserEvent.class);
        verify(messaging).convertAndSendToUser(eq("alice"), eq("/queue/events"), events.capture());
        verify(messaging).convertAndSendToUser(eq("bob"), eq("/queue/events"), events.capture());
        for (var event : events.getAllValues()) {
            assertThat(event.type()).isEqualTo("ROOM_ACTIVITY");
            var payload = (RoomActivityPayload) event.payload();
            assertThat(payload.roomId()).isEqualTo("room");
            assertThat(payload.lastMessage()).isEqualTo(new LastMessageSummary("saved", "alice", "Alice", "😀".repeat(100), Instant.EPOCH));
        }
        verifyNoMoreInteractions(messaging);
    }

    @Test
    void roomActivity_systemMessage_sendsNothing() {
        new UserEventPublisher(messaging).roomActivity(Set.of("alice"), ChatMessageResponse.builder().type(MessageType.SYSTEM).build());
        verifyNoInteractions(messaging);
    }

    @Test
    void roomActivity_shortOrMissingContent_handlesPreview() {
        var publisher = new UserEventPublisher(messaging);
        for (String content : new String[]{"hello", "", null}) {
            publisher.roomActivity(Set.of("alice"), ChatMessageResponse.builder().type(MessageType.TEXT).content(content).build());
        }
        var events = ArgumentCaptor.forClass(UserEvent.class);
        verify(messaging, times(3)).convertAndSendToUser(eq("alice"), eq("/queue/events"), events.capture());
        assertThat(events.getAllValues()).extracting(e -> ((RoomActivityPayload) e.payload()).lastMessage().preview())
            .containsExactly("hello", "", "");
    }

    @Test
    void roomActivity_deliveryFails_logsMetadataOnlyAndContinuesFanout() {
        var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(UserEventPublisher.class);
        var logs = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        logs.start(); logger.addAppender(logs);
        try {
            doThrow(new org.springframework.messaging.MessagingException("secret preview in failure"))
                .when(messaging).convertAndSendToUser(eq("alice"), eq("/queue/events"), any());
            new UserEventPublisher(messaging).roomActivity(java.util.List.of("alice", "bob"),
                ChatMessageResponse.builder().type(MessageType.TEXT).content("secret preview").build());
            verify(messaging).convertAndSendToUser(eq("bob"), eq("/queue/events"), any());
            assertThat(logs.list).singleElement().satisfies(event -> {
                assertThat(event.getFormattedMessage()).contains("ROOM_ACTIVITY", "alice").doesNotContain("secret preview");
                assertThat(event.getThrowableProxy()).isNull();
            });
        } finally {
            logger.detachAppender(logs); logs.stop();
        }
    }

    @Test
    void presenceScopeChanged_affectedAccounts_receivesEmptyPrivateInvalidation() {
        var publisher = new UserEventPublisher(messaging);
        publisher.presenceScopeChanged(Set.of("remaining", "departing"));
        var users = ArgumentCaptor.forClass(String.class);
        var events = ArgumentCaptor.forClass(UserEvent.class);
        verify(messaging, times(2)).convertAndSendToUser(users.capture(), eq("/queue/events"), events.capture());
        assertThat(users.getAllValues()).containsExactlyInAnyOrder("remaining", "departing");
        assertThat(events.getAllValues()).allSatisfy(event -> {
            assertThat(event.type()).isEqualTo("PRESENCE_SCOPE_CHANGED");
            assertThat(event.payload()).isEqualTo(Map.of());
        });
        verifyNoMoreInteractions(messaging);
    }

}
