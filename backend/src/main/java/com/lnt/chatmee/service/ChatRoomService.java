package com.lnt.chatmee.service;

import java.util.HashMap;
import java.util.Comparator;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.repository.MessageRepository;
import java.util.HashSet;
import java.util.Optional;
import java.util.Objects;
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
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
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
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.RoomState;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.service.policy.RoomTypePolicy;
import com.lnt.chatmee.service.policy.RoomTypePolicyRegistry;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.security.RoomSubscriptionInterceptor;
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

    /** Bounded retries when a concurrent role change or leave moves the caller's membership mid-leave. */
    private static final int LEAVE_ATTEMPTS = 5;

    private static final Logger logger = LoggerFactory.getLogger(ChatRoomService.class);

    private final ChatRoomRepository chatRoomRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;
    private final UserEventPublisher userEvents;
    private final ParticipantService participantService;
    private final SimpMessagingTemplate messagingTemplate;
    private final RoomTypePolicyRegistry policies;
    private final DirectMessageRequestService dmRequests;
    private final RateLimitingService rateLimitingService;

    public ChatRoomResponse createRoom(CreateChatRoomRequest request, String userId) {

        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        RoomTypePolicy policy = policies.get(request.getRoomType());
        ChatRoom candidate = policy.create(request, authenticatedUser.getId(),
            id -> userRepository.findById(id).isPresent());
        if (candidate.getState() == RoomState.REQUESTED) {
            dmRequests.checkCanRequest(authenticatedUser.getId(), request.getParticipantId());
        } else {
            rateLimitingService.checkDailyAction(RateLimitingService.DailyAction.ROOM_CREATE, authenticatedUser.getId());
        }
        ChatRoom room;
        try {
            room = chatRoomRepository.save(candidate);
        } catch (DuplicateKeyException ex) {
            // A concurrent request created the same DM first: apply the same-pair rules to that room instead.
            return findActiveDirectRoom(candidate.getMemberKey(), authenticatedUser.getId()).orElseThrow(() -> ex);
        }
        policy.initialMembers(request, authenticatedUser.getId()).forEach((id, role) ->
            participantService.createParticipant(room.getId(), id, role));
        if (room.getState() == RoomState.REQUESTED) {
            dmRequests.open(room, authenticatedUser.getId(), request.getParticipantId());
        }
        logger.info("Created {} room: {} with creator: {}", room.getType(), room.getId(), authenticatedUser.getId());

        ChatRoomResponse response = toResponse(room, authenticatedUser.getId());
        userEvents.roomAdded(authenticatedUser.getId(), response);
        policy.initialMembers(request, authenticatedUser.getId()).keySet().stream()
            .filter(id -> !id.equals(authenticatedUser.getId()))
            .forEach(id -> userEvents.roomAdded(id, toResponse(room, id)));
        return response;
    }

    /**
     * The caller's DM with the request's participant, if one exists (one DM per pair, SPEC-003). A REQUESTED DM
     * follows the same-pair rules of AC-009-9: the sender gets it back, the recipient accepts it.
     */
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
        return chatRoomRepository.findByMemberKeyAndIsActiveTrue(memberKey).flatMap(room ->
            room.getState() == RoomState.REQUESTED
                ? dmRequests.resolveRequested(room, userId)
                : Optional.of(toResponse(room, userId)));
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
        Map<String, Participant> memberships = new HashMap<>();
        participantService.getMemberships(callerId).forEach(row -> memberships.put(row.getChatRoomId(), row));
        return rooms.stream()
            .map(room -> ChatRoomResponse.from(room, members.getOrDefault(room.getId(), Set.of()),
                summaries.get(counterpartIds.get(room.getId())), unreadCount(room.getId(), callerId, memberships.get(room.getId())),
                memberships.containsKey(room.getId()) ? memberships.get(room.getId()).getRole() : null))
            .toList();
    }

    private long unreadCount(String roomId, String callerId, Participant membership) {
        return membership == null || membership.getLastReadAt() == null ? 0
            : messageRepository.countUnread(roomId, callerId, membership.getLastReadAt());
    }

    public ChatRoom findById(String roomId) {
        return chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
    }

    /**
     * Soft-deletes the room: it is marked inactive, every membership is removed (blocking new STOMP
     * authorization and ordinary outbound delivery), and a SYSTEM message reaches the pre-delete members.
     */
    public void deleteChatRoomById(String userId, String roomId) {
        User authenticatedUser = userRepository.findById(userId)
        .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        // Validate IDs
        ValidationUtil.validateId(roomId, "Room ID");

        findById(roomId);

        if (roleOf(roomId, authenticatedUser.getId()) != Role.OWNER) {
            throw new UnauthorizedRoomActionException("Only the owner can delete the room");
        }

        softDeleteRoom(roomId, authenticatedUser);
    }

    /** Participant role of the user in the room, or null when the user is not a member (AC-009-25). */
    private Role roleOf(String roomId, String userId) {
        return participantService.findMembership(roomId, userId).map(Participant::getRole).orElse(null);
    }

    private void softDeleteRoom(String roomId, User actor) {
        Set<String> deletedRecipients = Set.copyOf(participantService.getParticipantUserIds(roomId));
        if (chatRoomRepository.softDelete(roomId, LocalDateTime.now()) == 0) {
            throw new ChatRoomNotFoundException("Can't find chat room with id: " + roomId);
        }
        long removed = participantService.removeAllParticipants(roomId);

        userEvents.roomRemoved(deletedRecipients, roomId, "DELETED");

        Instant now = Instant.now();
        Message deletionMessage = Message.builder()
            .chatRoomId(roomId)
            .senderId(actor.getId())
            .content(ROOM_DELETED_MESSAGE)
            .type(Message.MessageType.SYSTEM)
            .createdAt(now)
            .updatedAt(now)
            .isUpdated(false)
            .isDeleted(false)
            .build();
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setHeader(RoomSubscriptionInterceptor.ROOM_DELETED_RECIPIENTS_HEADER, deletedRecipients);
        headers.setLeaveMutable(true);
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId,
                ChatMessageResponse.from(deletionMessage, actor.getName(), null), headers.getMessageHeaders());

        logger.info("Room {} soft-deleted by user {}, {} memberships removed", roomId, actor.getId(), removed);
    }

    public List<ChatRoom> getList(String userId) {
        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        List<String> roomIds = participantService.getRoomIdsOfUser(authenticatedUser.getId());
        if (roomIds.isEmpty()) {
            return List.of();
        }
        return chatRoomRepository.findByIdInAndIsActiveTrue(roomIds).stream()
            .sorted(Comparator.comparing(ChatRoomResponse::activityAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();
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

        Role role = roleOf(roomId, authenticatedUser.getId());
        if (role != Role.OWNER && role != Role.ADMIN) {
            throw new UnauthorizedRoomActionException("Only the owner or an admin can update the room");
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

        ChatRoom updatedRoom = findById(roomId);
        if (!Objects.equals(room.getName(), name) || !Objects.equals(room.getDescription(), description)
                || room.getMaxParticipants() != maxParticipants) {
            for (String memberId : participantService.getParticipantUserIds(roomId)) {
                userEvents.roomUpdated(memberId, toResponse(updatedRoom, memberId));
            }
        }
        return updatedRoom;
    }

    public void leaveChatRoomById(String userId, String roomId) {
        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        ChatRoom room = getRoomOfMember(roomId, authenticatedUser.getId());

        policies.get(room.getType()).checkLeave(room, authenticatedUser.getId());

        // The membership is re-read on every attempt: a concurrent role change or leave may have moved it (ADR-0005).
        for (int attempt = 0; attempt < LEAVE_ATTEMPTS; attempt++) {
            Participant membership = participantService.findMembership(roomId, authenticatedUser.getId())
                .orElseThrow(() -> new UnauthorizedRoomActionException("User is not a participant of this room"));
            boolean left = membership.getRole() == Role.OWNER
                ? leaveAsOwner(room, authenticatedUser)
                : leaveAsMember(room, authenticatedUser, membership.getRole());
            if (left) {
                logger.info("User {} successfully left room {}", authenticatedUser.getId(), roomId);
                return;
            }
        }
        throw new UnauthorizedRoomActionException("Room membership changed concurrently, retry the request");
    }

    private boolean leaveAsMember(ChatRoom room, User leaver, Role role) {
        if (!participantService.removeParticipantIfRole(room.getId(), leaver.getId(), role)) {
            return false;
        }
        userEvents.roomRemoved(Set.of(leaver.getId()), room.getId(), "LEFT");
        participantService.postLeaveMessage(room.getId(), leaver.getName());
        return true;
    }

    /**
     * The owner's successor is promoted before the owner row is removed (AC-009-24). If the owner row is already
     * gone, the promotion is reverted so exactly one OWNER remains. A sole owner soft-deletes the room.
     */
    private boolean leaveAsOwner(ChatRoom room, User leaver) {
        Optional<Participant> successor = participantService.findSuccessor(room.getId(), leaver.getId());
        if (successor.isEmpty()) {
            softDeleteRoom(room.getId(), leaver);
            return true;
        }
        String successorId = successor.get().getUserId();
        Role successorRole = successor.get().getRole();
        if (!participantService.changeRoleIfCurrent(room.getId(), successorId, successorRole, Role.OWNER)) {
            return false;
        }
        if (!participantService.removeParticipantIfRole(room.getId(), leaver.getId(), Role.OWNER)) {
            participantService.changeRoleIfCurrent(room.getId(), successorId, Role.OWNER, successorRole);
            return false;
        }
        userEvents.roomRemoved(Set.of(leaver.getId()), room.getId(), "LEFT");
        participantService.postLeaveMessage(room.getId(), leaver.getName());
        participantService.announceOwnerTransfer(room.getId(), successorId);
        userEvents.roomUpdated(successorId, toResponse(room, successorId));
        return true;
    }
}
