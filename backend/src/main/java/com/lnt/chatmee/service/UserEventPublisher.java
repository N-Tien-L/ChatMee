package com.lnt.chatmee.service;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import com.lnt.chatmee.dto.event.UserEvent;
import com.lnt.chatmee.dto.event.RoomRemovedPayload;
import com.lnt.chatmee.dto.event.RoomActivityPayload;
import com.lnt.chatmee.dto.event.LastMessageSummary;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.DmRequestResponse;
import com.lnt.chatmee.dto.response.InvitationResponse;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Message.MessageType;
import org.springframework.context.annotation.Lazy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

/** Publishes transient events to every session of the affected internal user id. */
@Service
public class UserEventPublisher {
    private static final Logger logger = LoggerFactory.getLogger(UserEventPublisher.class);
    private final SimpMessagingTemplate messagingTemplate;

    // ParticipantService is also used during broker configuration; defer the broker template.
    public UserEventPublisher(@Lazy SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void roomAdded(String userId, ChatRoomResponse room) {
        send(userId, new UserEvent<>("ROOM_ADDED", Map.of("room", room), Instant.now()));
    }

    public void roomUpdated(String userId, ChatRoomResponse room) {
        send(userId, new UserEvent<>("ROOM_UPDATED", Map.of("room", room), Instant.now()));
    }

    public void roomRemoved(Collection<String> userIds, String roomId, String reason) {
        var event = new UserEvent<>("ROOM_REMOVED", new RoomRemovedPayload(roomId, reason), Instant.now());
        userIds.forEach(userId -> send(userId, event));
    }

    public void roomActivity(Collection<String> userIds, ChatMessageResponse message) {
        if (message.type() == MessageType.SYSTEM) {
            return;
        }
        String content = message.content() == null ? "" : message.content();
        int end = content.offsetByCodePoints(0, Math.min(100, content.codePointCount(0, content.length())));
        var summary = new LastMessageSummary(message.id(), message.senderId(), message.senderName(),
            content.substring(0, end), message.createdAt());
        roomActivity(userIds, message.chatRoomId(), summary);
    }

    public void roomActivity(Collection<String> userIds, String roomId, LastMessageSummary summary) {
        var event = new UserEvent<>("ROOM_ACTIVITY", new RoomActivityPayload(roomId, summary), Instant.now());
        userIds.forEach(userId -> send(userId, event));
    }

    public void invitationReceived(String inviteeId, InvitationResponse invitation) {
        send(inviteeId, new UserEvent<>("INVITATION_RECEIVED", Map.of("invitation", invitation), Instant.now()));
    }

    public void invitationChanged(Collection<String> userIds, String invitationId, String roomId,
            MembershipRequestStatus status) {
        var event = new UserEvent<>("INVITATION_CHANGED",
            Map.of("invitationId", invitationId, "roomId", roomId, "status", status), Instant.now());
        userIds.forEach(userId -> send(userId, event));
    }

    /** Sent on create and again when the one allowed message sets the preview; the client upserts by roomId. */
    public void dmRequestReceived(String recipientId, DmRequestResponse request) {
        send(recipientId, new UserEvent<>("DM_REQUEST_RECEIVED", Map.of("request", request), Instant.now()));
    }

    /** Broadcasts a saved server-generated announcement through the existing room topic. */
    public void systemMessage(ChatMessageResponse message) {
        try {
            messagingTemplate.convertAndSend("/topic/rooms/" + message.chatRoomId(), message);
        } catch (MessagingException ex) {
            logger.warn("Failed to broadcast SYSTEM message {} for room {}", message.id(), message.chatRoomId());
        }
    }

    private void send(String userId, UserEvent<?> event) {
        try {
            messagingTemplate.convertAndSendToUser(userId, "/queue/events", event);
        } catch (MessagingException ex) {
            // Framework exceptions may embed the payload. Log metadata only; resync recovers delivery.
            logger.warn("Failed to publish {} event to user {}", event.type(), userId);
        }
    }
}
