package com.lnt.chatmee.service;

import java.util.List;
import com.lnt.chatmee.dto.event.LastMessageSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.MessagingException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.time.Instant;
import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.exception.UserNotFoundException;
import java.util.stream.Collectors;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.response.MessagePageResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DatabaseOperationException;
import com.lnt.chatmee.exception.DmRequestPendingException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.RoomState;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MessageService {


    private static final Logger logger = LoggerFactory.getLogger(MessageService.class);

    private final ChatRoomRepository chatRoomRepository;
    private final ParticipantService participantService;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final UserEventPublisher userEvents;
    private final DirectMessageRequestService dmRequests;
    private final ParticipantRepository participantRepository;

    public ChatMessageResponse sendMessage(ChatMessageRequest request, String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        boolean member = participantService.isUserParticipant(request.getRoomId(), userId);
        // A reply from the recipient of a REQUESTED DM accepts the request first (AC-009-12).
        if (!member && !dmRequests.acceptByReply(request.getRoomId(), userId)) {
            throw new ForbiddenActionException("Room membership required");
        }
        Message message = Message.builder()
                .id(UUID.randomUUID().toString())
                .chatRoomId(request.getRoomId()).senderId(userId)
                .clientMessageId(clientMessageId(request.getTempId()))
                .type(request.getMessageType()).content(request.getContent())
                .createdAt(Instant.now()).updatedAt(Instant.now())
                .isUpdated(false).isDeleted(false).build();
        // SYSTEM messages never write the activity summary, so they never take the request-message slot.
        boolean requestMessage = member && message.getType() != Message.MessageType.SYSTEM
                && claimRequestMessage(message, user.getName());
        // Only the successfully persisted message may be acknowledged to the room.
        Message saved;
        try {
            saved = persistMessage(message);
        } catch (RuntimeException ex) {
            if (requestMessage) {
                chatRoomRepository.releaseRequestMessage(message.getChatRoomId(), message.getId());
            }
            throw ex;
        }
        ChatMessageResponse response = ChatMessageResponse.from(saved, user.getName(), request.getTempId());

        if (saved.getType() != Message.MessageType.SYSTEM) {
            var summary = summary(saved, user.getName());
            try {
                chatRoomRepository.updateActivity(saved.getChatRoomId(), saved.getCreatedAt(), summary);
            } catch (DataAccessException | MessagingException ex) {
                logger.warn("Failed to update room activity for room {} message {}", saved.getChatRoomId(), saved.getId());
            }
            // D-06: members who hid the room before this message see it again; ROOM_ACTIVITY below reaches them too.
            try {
                participantRepository.unhideBefore(saved.getChatRoomId(), saved.getCreatedAt());
            } catch (DataAccessException ex) {
                logger.warn("Failed to unhide room {} for message {}", saved.getChatRoomId(), saved.getId());
            }
            try {
                userEvents.roomActivity(participantService.getParticipantUserIds(saved.getChatRoomId()),
                    saved.getChatRoomId(), summary);
            } catch (DataAccessException | MessagingException ex) {
                logger.warn("Failed to publish room activity for room {} message {}", saved.getChatRoomId(), saved.getId());
            }
        }
        if (requestMessage) {
            try {
                dmRequests.previewChanged(saved.getChatRoomId());
            } catch (DataAccessException | MessagingException ex) {
                logger.warn("Failed to publish DM request preview for room {} message {}", saved.getChatRoomId(), saved.getId());
            }
        }
        return response;
    }

    /**
     * In a REQUESTED DM the sender may send one message (AC-009-10): it takes the room's request-message slot before
     * it is saved, so concurrent sends let exactly one through. A retry of that stored message needs no slot.
     *
     * @return true if this message is the request message (its slot must be released if the save fails)
     */
    private boolean claimRequestMessage(Message message, String senderName) {
        String roomId = message.getChatRoomId();
        boolean requested = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
                .map(room -> room.getState() == RoomState.REQUESTED).orElse(false);
        if (!requested || findStoredDuplicate(message).isPresent()) {
            return false;
        }
        if (dmRequests.expireIfDue(roomId)) {
            throw new ForbiddenActionException("Room membership required");
        }
        if (chatRoomRepository.claimRequestMessage(roomId, message.getCreatedAt(), summary(message, senderName)) > 0) {
            return true;
        }
        boolean stillRequested = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
                .map(room -> room.getState() == RoomState.REQUESTED).orElse(false);
        if (stillRequested) {
            throw new DmRequestPendingException("Wait until the recipient accepts your request");
        }
        // Accepted meanwhile: an ordinary message.
        return false;
    }

    private static LastMessageSummary summary(Message message, String senderName) {
        String content = message.getContent() == null ? "" : message.getContent();
        int end = content.offsetByCodePoints(0, Math.min(100, content.codePointCount(0, content.length())));
        return new LastMessageSummary(message.getId(), message.getSenderId(), senderName,
            content.substring(0, end), message.getCreatedAt());
    }

    /** A blank tempId is no idempotency key, so the message is stored without a client id. */
    private static String clientMessageId(String tempId) {
        return tempId == null || tempId.isBlank() ? null : tempId;
    }

    public List<ChatMessageResponse> getRecentMessages(String roomId, String userId) {
        return getMessages(roomId, userId, null, 50).messages();
    }

    public MessagePageResponse getMessages(String roomId, String userId, String before, int limit) {
        userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        if(!chatRoomRepository.existsById(roomId)) {
            throw new ChatRoomNotFoundException("Chat room not found: " + roomId);
        }

        if(!participantService.isUserParticipant(roomId, userId)) {
            throw new ForbiddenActionException("You are not a participant of this room");
        }

        MessageCursor cursor = MessageCursor.decode(before);
        int pageSize = limit <= 0 ? 50 : Math.min(limit, 100);
        PageRequest request = PageRequest.of(0, pageSize + 1);
        try {
            List<Message> rows = cursor == null
                    ? messageRepository.findPage(roomId, request)
                    : messageRepository.findPageBefore(roomId, cursor.createdAt(), cursor.messageId(), request);
            boolean hasMore = rows.size() > pageSize;
            List<Message> page = new ArrayList<>(rows.subList(0, Math.min(pageSize, rows.size())));
            Collections.reverse(page);

            Map<String, String> senderNames = new HashMap<>();
            if (!page.isEmpty()) {
                Set<String> senderIds = page.stream().map(Message::getSenderId).collect(Collectors.toSet());
                userRepository.findAllById(senderIds).forEach(user -> {
                    if (user.getName() != null) {
                        senderNames.put(user.getId(), user.getName());
                    }
                });
            }
            List<ChatMessageResponse> messages = page.stream()
                    .map(message -> ChatMessageResponse.from(message,
                            senderNames.getOrDefault(message.getSenderId(), "Unknown User"), null))
                    .toList();
            String nextCursor = hasMore
                    ? new MessageCursor(page.get(0).getCreatedAt(), page.get(0).getId()).encode() : null;
            return new MessagePageResponse(messages, nextCursor, hasMore);
        } catch (DataAccessException e) {
            throw new DatabaseOperationException("Failed to fetch messages", e);
        }
    }

    /**
     * Persist synchronously; callers may broadcast only the returned saved message. A repeat of a stored
     * client id returns the stored message instead of a second row (idempotent retry and Resend).
     */
    public Message persistMessage(Message message) {
        try {
            return messageRepository.save(message);
        } catch (DuplicateKeyException ex) {
            return findStoredDuplicate(message)
                    .orElseThrow(() -> new DatabaseOperationException("Failed to save message", ex));
        } catch (DataAccessException ex) {
            throw new DatabaseOperationException("Failed to save message", ex);
        }
    }

    private Optional<Message> findStoredDuplicate(Message message) {
        if (message.getClientMessageId() == null) {
            return Optional.empty();
        }
        return messageRepository.findFirstByChatRoomIdAndSenderIdAndClientMessageId(
                message.getChatRoomId(), message.getSenderId(), message.getClientMessageId());
    }

    /** Membership announcements are persisted before publication and never update room activity. */
    public ChatMessageResponse postSystemMessage(String roomId, String text) {
        Instant now = Instant.now();
        Message saved = persistMessage(Message.builder().id(UUID.randomUUID().toString())
            .chatRoomId(roomId).senderId("SYSTEM").content(text).type(Message.MessageType.SYSTEM)
            .createdAt(now).updatedAt(now).isUpdated(false).isDeleted(false).build());
        ChatMessageResponse response = ChatMessageResponse.from(saved, "System", null);
        userEvents.systemMessage(response);
        return response;
    }

}
