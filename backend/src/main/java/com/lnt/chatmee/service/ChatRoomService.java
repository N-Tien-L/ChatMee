package com.lnt.chatmee.service;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import com.lnt.chatmee.dto.response.PublicRoomSummary;
import com.lnt.chatmee.dto.response.UserSummaryResponse;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.service.policy.RoomTypePolicy;
import com.lnt.chatmee.service.policy.RoomTypePolicyRegistry;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.util.ValidationUtil;

import lombok.RequiredArgsConstructor;

/**
 * Room use cases. Membership lives only in the participants collection (ADR-0005); writes that touch the
 * member counter go through the atomic updates in {@link ChatRoomRepository}, never through a full save.
 */
@Service
@RequiredArgsConstructor
public class ChatRoomService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;

    static final String ROOM_DELETED_MESSAGE = "This room has been deleted";

    private static final Logger logger = LoggerFactory.getLogger(ChatRoomService.class);

    private final ChatRoomRepository chatRoomRepository;
    private final UserRepository userRepository;
    private final ParticipantService participantService;
    private final SimpMessagingTemplate messagingTemplate;
    private final RoomTypePolicyRegistry policies;

    public ChatRoomResponse createRoom(CreateChatRoomRequest request, String userId) {

        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        RoomTypePolicy policy = policies.get(request.getRoomType());
        ChatRoom candidate = policy.create(request, authenticatedUser.getId(),
            id -> userRepository.findById(id).isPresent());
        ChatRoom room;
        try {
            room = chatRoomRepository.save(candidate);
        } catch (DuplicateKeyException ex) {
            // A concurrent request created the same DM first: return that room instead of a duplicate.
            return findActiveDirectRoom(candidate.getMemberKey(), authenticatedUser.getId()).orElseThrow(() -> ex);
        }
        policy.initialMembers(request, authenticatedUser.getId()).forEach((id, role) ->
            participantService.createParticipant(room.getId(), id, role));
        logger.info("Created {} room: {} with creator: {}", room.getType(), room.getId(), authenticatedUser.getId());

        return toResponse(room, authenticatedUser.getId());
    }

    /** The caller's active DM with the request's participant, if one exists (one DM per pair, SPEC-003). */
    public Optional<ChatRoomResponse> findExistingDirectRoom(CreateChatRoomRequest request, String userId) {
        if (request.getRoomType() == null) {
            return Optional.empty();
        }
        return findActiveDirectRoom(policies.get(request.getRoomType()).memberKey(request, userId), userId);
    }

    private Optional<ChatRoomResponse> findActiveDirectRoom(String memberKey, String userId) {
        if (memberKey == null) {
            return Optional.empty();
        }
        return chatRoomRepository.findByMemberKeyAndIsActiveTrue(memberKey).map(room -> toResponse(room, userId));
    }

    /** Maps a room to the caller's view of it, reading the member ids from the participants collection. */
    public ChatRoomResponse toResponse(ChatRoom room, String callerId) {
        return toResponses(List.of(room), callerId).get(0);
    }

    /**
     * Maps several rooms with one participants query and one user query; DM rooms carry the other member
     * as {@code counterpart} so the client needs no per-room lookup.
     */
    public List<ChatRoomResponse> toResponses(List<ChatRoom> rooms, String callerId) {
        Map<String, Set<String>> members = participantService.getParticipantUserIds(
            rooms.stream().map(ChatRoom::getId).toList());
        Map<String, String> counterpartIds = new HashMap<>();
        for (ChatRoom room : rooms) {
            if (room.getType() != null && policies.get(room.getType()).showsCounterpart()) {
                members.getOrDefault(room.getId(), Set.of()).stream()
                    .filter(id -> !id.equals(callerId))
                    .findFirst()
                    .ifPresent(id -> counterpartIds.put(room.getId(), id));
            }
        }
        Map<String, UserSummaryResponse> summaries = new HashMap<>();
        if (!counterpartIds.isEmpty()) {
            userRepository.findAllById(new HashSet<>(counterpartIds.values())).forEach(user ->
                summaries.put(user.getId(), new UserSummaryResponse(user.getId(), user.getName(), user.getAvatarUrl())));
        }
        return rooms.stream()
            .map(room -> ChatRoomResponse.from(room, members.getOrDefault(room.getId(), Set.of()),
                summaries.get(counterpartIds.get(room.getId()))))
            .toList();
    }

    public ChatRoom findById(String roomId) {
        return chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
    }

    /**
     * Soft-deletes the room: it is marked inactive, every membership is removed (blocking new STOMP
     * authorization for the room; existing subscriptions await CM-058), and a SYSTEM message is broadcast to the room topic.
     */
    public void deleteChatRoomById(String userId, String roomId) {
        User authenticatedUser = userRepository.findById(userId)
        .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        // Validate IDs
        ValidationUtil.validateId(roomId, "Room ID");

        ChatRoom room = findById(roomId);

        if (!room.getCreatedBy().equals(authenticatedUser.getId())) {
            throw new UnauthorizedRoomActionException("Only room creator can delete the room");
        }

        if (chatRoomRepository.softDelete(roomId, LocalDateTime.now()) == 0) {
            throw new ChatRoomNotFoundException("Can't find chat room with id: " + roomId);
        }
        long removed = participantService.removeAllParticipants(roomId);

        Instant now = Instant.now();
        Message deletionMessage = Message.builder()
            .chatRoomId(roomId)
            .senderId(authenticatedUser.getId())
            .content(ROOM_DELETED_MESSAGE)
            .type(Message.MessageType.SYSTEM)
            .createdAt(now)
            .updatedAt(now)
            .isUpdated(false)
            .isDeleted(false)
            .build();
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId,
                ChatMessageResponse.from(deletionMessage, authenticatedUser.getName(), null));

        logger.info("Room {} soft-deleted by user {}, {} memberships removed", roomId, authenticatedUser.getId(), removed);
    }

    public List<ChatRoom> getList(String userId) {
        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        List<String> roomIds = participantService.getRoomIdsOfUser(authenticatedUser.getId());
        if (roomIds.isEmpty()) {
            return List.of();
        }
        return chatRoomRepository.findByIdInAndIsActiveTrue(roomIds);
    }

    /** Page is clamped to >= 0 and size to 1..MAX_PAGE_SIZE (non-positive size falls back to the default). */
    public Page<PublicRoomSummary> discoverRooms(String userId, String query, int page, int size) {
        String searchQuery = query == null ? "" : query.trim();
        int pageSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        List<String> joinedRoomIds = participantService.getRoomIdsOfUser(userId);
        return chatRoomRepository.findDiscoverable(searchQuery, joinedRoomIds, PageRequest.of(Math.max(page, 0), pageSize))
            .map(PublicRoomSummary::from);
    }

    public ChatRoom getChatRoomById(String userId, String roomId) {
        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        return getRoomOfMember(roomId, authenticatedUser.getId());
    }

    private ChatRoom getRoomOfMember(String roomId, String userId) {
        ChatRoom room = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId + " or user is not a participant"));
        if (!participantService.isUserParticipant(roomId, userId)) {
            throw new ChatRoomNotFoundException("Can't find chat room with id: " + roomId + " or user is not a participant");
        }
        return room;
    }

    public ChatRoom updateChatRoomById(String userId, String roomId, UpdateChatRoomRequest request) {
        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        ChatRoom room = getRoomOfMember(roomId, authenticatedUser.getId());

        if(!room.getCreatedBy().equals(authenticatedUser.getId())) {
            throw new UnauthorizedRoomActionException("Only room creator can update the room");
        }

        policies.get(room.getType()).checkUpdate(request);

        String name = request.getRoomName() != null && !request.getRoomName().trim().isEmpty()
            ? request.getRoomName().trim()
            : room.getName();
        String description = request.getDescription() != null ? request.getDescription().trim() : room.getDescription();
        int maxParticipants = request.getMaxUsers() != null ? request.getMaxUsers() : room.getMaxParticipants();
        ChatRoom.RoomSettings settings = request.getSettings() != null ? request.getSettings() : room.getSettings();

        // A targeted $set keeps concurrent joins/leaves intact and re-checks capacity against the live counter
        long updated = chatRoomRepository.updateEditableFields(roomId, name, description, maxParticipants,
            settings, LocalDateTime.now());
        if (updated == 0) {
            throw new InvalidRequestException("Max users cannot be less than current participants");
        }

        return findById(roomId);
    }

    public void leaveChatRoomById(String userId, String roomId) {
        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        ChatRoom room = getRoomOfMember(roomId, authenticatedUser.getId());

        policies.get(room.getType()).checkLeave(room, authenticatedUser.getId());

        if (!participantService.removeParticipant(roomId, authenticatedUser.getId())) {
            throw new UnauthorizedRoomActionException("User is not a participant of this room");
        }

        logger.info("User {} successfully left room {}", authenticatedUser.getId(), roomId);
    }
}
