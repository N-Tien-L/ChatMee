package com.lnt.chatmee.security;

import java.security.Principal;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import com.lnt.chatmee.service.ParticipantService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.ExecutorChannelInterceptor;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/** Re-authorizes delivery to existing room subscriptions without closing the socket. */
@RequiredArgsConstructor
public class RoomSubscriptionInterceptor implements ExecutorChannelInterceptor {
    // An internal Simp header, never a native STOMP header or a client-supplied field.
    public static final String ROOM_DELETED_RECIPIENTS_HEADER = "chatmeeRoomDeletedRecipients";
    private static final String ROOM_PREFIX = "/topic/rooms/";
    private static final String TYPING_SUFFIX = "/typing";

    private final ParticipantService participantService;
    private final ConcurrentMap<String, String> sessionUsers = new ConcurrentHashMap<>();

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        String sessionId = SimpMessageHeaderAccessor.getSessionId(event.getMessage().getHeaders());
        Principal user = event.getUser();
        if (sessionId != null && user != null && user.getName() != null && !user.getName().isBlank()) {
            sessionUsers.put(sessionId, user.getName());
        }
    }

    @EventListener
    public void onDisconnected(SessionDisconnectEvent event) {
        sessionUsers.remove(event.getSessionId());
    }

    @Override
    public Message<?> beforeHandle(Message<?> message, MessageChannel channel, MessageHandler handler) {
        if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) != SimpMessageType.MESSAGE) {
            return message;
        }
        String destination = SimpMessageHeaderAccessor.getDestination(message.getHeaders());
        if (destination == null || !destination.startsWith(ROOM_PREFIX)) {
            return message;
        }
        String path = destination.substring(ROOM_PREFIX.length());
        boolean typing = path.endsWith(TYPING_SUFFIX);
        String roomId = typing ? path.substring(0, path.length() - TYPING_SUFFIX.length()) : path;
        if (roomId.isBlank() || roomId.contains("/")) {
            return null;
        }
        String sessionId = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
        String userId = sessionId == null ? null : sessionUsers.get(sessionId);
        if (userId == null) {
            return null;
        }
        Object deletedRecipients = message.getHeaders().get(ROOM_DELETED_RECIPIENTS_HEADER);
        if (!typing && deletedRecipients instanceof Set<?> recipients) {
            // Memberships are already removed when the existing terminal SYSTEM event is sent.
            // Only that marked broadcast carries this immutable, pre-delete audience.
            return recipients.contains(userId) ? message : null;
        }
        try {
            // No membership cache: REST changes on another instance are visible on the next check.
            // beforeHandle runs after executor queuing, immediately before transport delivery.
            return participantService.isUserParticipant(roomId, userId) ? message : null;
        } catch (DataAccessException unavailable) {
            // Fail closed for this frame, keeping unrelated topics and the connection usable.
            return null;
        }
    }
}
