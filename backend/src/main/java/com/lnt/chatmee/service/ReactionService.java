package com.lnt.chatmee.service;

import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.messaging.MessagingException;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.event.ReactionUpdatedEvent;
import com.lnt.chatmee.dto.response.MessageReactionsResponse;
import com.lnt.chatmee.dto.response.ReactionSummaryResponse;
import com.lnt.chatmee.dto.response.ReactorPageResponse;
import com.lnt.chatmee.dto.response.ReactorResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DatabaseOperationException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Reaction;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ReactionRepository;
import com.lnt.chatmee.repository.ReactionTally;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.util.DisplayNames;
import com.lnt.chatmee.util.EmojiValidator;

import lombok.RequiredArgsConstructor;

/** Message reactions (SPEC-015): one per user per message, member-only, summarised per history page. */
@Service
@RequiredArgsConstructor
public class ReactionService {

    private static final Logger logger = LoggerFactory.getLogger(ReactionService.class);

    /** Chips shown under a bubble (AC-015-5). */
    static final int SUMMARY_SIZE = 6;
    static final int DEFAULT_PAGE = 20;
    static final int MAX_PAGE = 50;

    private static final Comparator<ReactionTally> SUMMARY_ORDER = Comparator
            .comparingLong(ReactionTally::count).reversed()
            .thenComparing(ReactionTally::firstAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(ReactionTally::emoji);

    private final ReactionRepository reactions;
    private final MessageRepository messages;
    private final ChatRoomRepository rooms;
    private final UserRepository users;
    private final ParticipantService participants;
    private final BlockService blocks;
    private final UserEventPublisher events;

    public MessageReactionsResponse react(String roomId, String messageId, String userId, String emoji) {
        if (!EmojiValidator.isSingleEmoji(emoji)) {
            throw new InvalidRequestException("Reaction must be a single emoji");
        }
        Message message = requireWritable(roomId, messageId, userId);
        try {
            reactions.setReaction(message.getId(), roomId, userId, emoji, Instant.now());
        } catch (DataAccessException ex) {
            throw new DatabaseOperationException("Failed to save reaction", ex);
        }
        return changed(roomId, message.getId(), userId);
    }

    public MessageReactionsResponse unreact(String roomId, String messageId, String userId) {
        Message message = requireWritable(roomId, messageId, userId);
        long removed;
        try {
            removed = reactions.deleteByMessageIdAndUserId(message.getId(), userId);
        } catch (DataAccessException ex) {
            throw new DatabaseOperationException("Failed to remove reaction", ex);
        }
        // Removing nothing is still a success (idempotent) and needs no event.
        return removed > 0 ? changed(roomId, message.getId(), userId) : mine(message.getId(), userId);
    }

    public ReactorPageResponse listReactors(String roomId, String messageId, String userId, String emoji,
            String cursor, int limit) {
        Message message = requireReadable(roomId, messageId, userId);
        String filter = emoji == null || emoji.isBlank() ? null : emoji;
        MessageCursor boundary = MessageCursor.decode(cursor);
        int size = limit <= 0 ? DEFAULT_PAGE : Math.min(limit, MAX_PAGE);
        List<Reaction> rows;
        try {
            rows = reactions.findPage(message.getId(), filter, boundary == null ? null : boundary.createdAt(),
                    boundary == null ? null : boundary.messageId(), size + 1);
        } catch (DataAccessException ex) {
            throw new DatabaseOperationException("Failed to fetch reactions", ex);
        }
        boolean hasMore = rows.size() > size;
        List<Reaction> page = rows.subList(0, Math.min(size, rows.size()));
        Map<String, String> names = new HashMap<>();
        if (!page.isEmpty()) {
            users.findAllById(page.stream().map(Reaction::getUserId).collect(Collectors.toSet()))
                    .forEach(user -> names.put(user.getId(), DisplayNames.of(user)));
        }
        List<ReactorResponse> items = page.stream()
                .map(r -> new ReactorResponse(r.getUserId(), names.getOrDefault(r.getUserId(), DisplayNames.DELETED_USER),
                        r.getEmoji(), r.getCreatedAt()))
                .toList();
        Reaction last = page.isEmpty() ? null : page.get(page.size() - 1);
        String next = hasMore && last != null ? new MessageCursor(last.getCreatedAt(), last.getId()).encode() : null;
        return new ReactorPageResponse(items, next, hasMore);
    }

    /** One aggregation for a whole history page; messages without reactions are absent from the map. */
    public Map<String, List<ReactionSummaryResponse>> summaries(Collection<String> messageIds, String userId) {
        if (messageIds.isEmpty()) {
            return Map.of();
        }
        List<ReactionTally> tallies;
        try {
            tallies = reactions.tally(messageIds, userId);
        } catch (DataAccessException ex) {
            throw new DatabaseOperationException("Failed to fetch reactions", ex);
        }
        Map<String, List<ReactionSummaryResponse>> byMessage = new HashMap<>();
        tallies.stream().collect(Collectors.groupingBy(ReactionTally::messageId)).forEach((id, list) ->
                byMessage.put(id, list.stream().sorted(SUMMARY_ORDER).limit(SUMMARY_SIZE)
                        .map(t -> new ReactionSummaryResponse(t.emoji(), t.count(), t.mine() > 0)).toList()));
        return byMessage;
    }

    /** A deleted room takes its reactions with it (AC-015-11). */
    public void deleteForRoom(String roomId) {
        try {
            reactions.deleteByRoomId(roomId);
        } catch (DataAccessException ex) {
            // The room is already deleted and unreadable; leftover rows are unreachable, not exposed.
            logger.warn("Failed to remove reactions of deleted room {}", roomId);
        }
    }

    private MessageReactionsResponse changed(String roomId, String messageId, String userId) {
        List<ReactionTally> tallies = reactions.tally(List.of(messageId), userId);
        List<ReactionTally> ordered = tallies.stream().sorted(SUMMARY_ORDER).limit(SUMMARY_SIZE).toList();
        try {
            events.reactionUpdated(roomId, new ReactionUpdatedEvent(messageId,
                    ordered.stream().map(t -> new ReactionUpdatedEvent.Count(t.emoji(), t.count())).toList()));
        } catch (MessagingException ex) {
            // The change is saved; clients converge on their next history load (AC-015-9).
            logger.warn("Failed to publish reaction update for room {} message {}", roomId, messageId);
        }
        return new MessageReactionsResponse(messageId,
                ordered.stream().map(t -> new ReactionSummaryResponse(t.emoji(), t.count(), t.mine() > 0)).toList());
    }

    private MessageReactionsResponse mine(String messageId, String userId) {
        return new MessageReactionsResponse(messageId,
                summaries(List.of(messageId), userId).getOrDefault(messageId, List.of()));
    }

    private record Target(ChatRoom room, Message message) {
    }

    /**
     * Member of an active room and a live message of that room; otherwise the same 404 for unknown room, unknown
     * message and non-member (AC-015-4).
     */
    private Target requireTarget(String roomId, String messageId, String userId) {
        ChatRoom room = rooms.findByIdAndIsActiveTrue(roomId)
                .orElseThrow(() -> new ChatRoomNotFoundException("Message not found"));
        if (!participants.isUserParticipant(roomId, userId)) {
            throw new ChatRoomNotFoundException("Message not found");
        }
        Message message = messages.findById(messageId)
                .filter(found -> roomId.equals(found.getChatRoomId()) && !found.isDeleted())
                .orElseThrow(() -> new ChatRoomNotFoundException("Message not found"));
        return new Target(room, message);
    }

    private Message requireReadable(String roomId, String messageId, String userId) {
        return requireTarget(roomId, messageId, userId).message();
    }

    /** Readable, not a SYSTEM message (400), and not a DM blocked either way (403, AC-015-4). */
    private Message requireWritable(String roomId, String messageId, String userId) {
        Target target = requireTarget(roomId, messageId, userId);
        if (target.message().getType() == Message.MessageType.SYSTEM) {
            throw new InvalidRequestException("System messages cannot be reacted to");
        }
        if (target.room().getType() == ChatRoom.RoomType.DIRECT_MESSAGE) {
            String other = otherMember(target.room(), userId);
            if (other != null && blocks.isBlockedEitherWay(userId, other)) {
                throw new ForbiddenActionException(BlockService.CANNOT_MESSAGE);
            }
        }
        return target.message();
    }

    private String otherMember(ChatRoom room, String userId) {
        if (room.getMemberKey() != null) {
            for (String id : room.getMemberKey().split(":", 2)) {
                if (!id.equals(userId)) {
                    return id;
                }
            }
            return null;
        }
        return participants.getParticipantUserIds(room.getId()).stream()
                .filter(id -> !id.equals(userId)).findFirst().orElse(null);
    }
}
