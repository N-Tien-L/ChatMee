package com.lnt.chatmee.service;

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
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.model.ChatRoom.RoomType;
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

    static final String ROOM_DELETED_MESSAGE = "This room has been deleted";

    private static final Logger logger = LoggerFactory.getLogger(ChatRoomService.class);

    private final ChatRoomRepository chatRoomRepository;
    private final UserRepository userRepository;
    private final ParticipantService participantService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatRoomResponse createRoom(CreateChatRoomRequest request, String userId) {

        User authenticatedUser = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        ChatRoom room;
        switch (request.getRoomType()) {
            case DIRECT_MESSAGE:
                room = createDirectRoom(request, authenticatedUser.getId());
                break;
            case PRIVATE:
            case PUBLIC:
                room = createConfigurableRoom(request, authenticatedUser.getId());
                break;
            default:
                throw new InvalidRequestException("Invalid room type: " + request.getRoomType());
        }

        return toResponse(room);
    }

    /** Maps a room to its API response, reading the member ids from the participants collection. */
    public ChatRoomResponse toResponse(ChatRoom room) {
        return toResponse(room, participantService.getParticipantUserIds(room.getId()));
    }

    /** Maps several rooms with a single participants query. */
    public List<ChatRoomResponse> toResponses(List<ChatRoom> rooms) {
        Map<String, Set<String>> members = participantService.getParticipantUserIds(
            rooms.stream().map(ChatRoom::getId).toList());
        return rooms.stream()
            .map(room -> toResponse(room, members.getOrDefault(room.getId(), Set.of())))
            .toList();
    }

    private static ChatRoomResponse toResponse(ChatRoom room, Set<String> participantIds) {
        return ChatRoomResponse.builder()
            .id(room.getId())
            .roomType(room.getType())
            .createdBy(room.getCreatedBy())
            .createdAt(room.getCreatedAt())
            .updatedAt(room.getLastActivity())
            .roomName(room.getName())
            .description(room.getDescription())
            .maxUsers(room.getMaxParticipants())
            .settings(room.getSettings())
            .participants(participantIds)
            .build();
    }

    private ChatRoom createDirectRoom(CreateChatRoomRequest request, String creatorId) {
        // Participant ID presence and format are enforced by CreateChatRoomRequest bean validation
        if(userRepository.findById(request.getParticipantId()).isEmpty()) {
            throw new UserNotFoundException("Participant not found");
        }
        if(creatorId.equals(request.getParticipantId())) {
            throw new InvalidRequestException("Cannot create direct message with yourself");
        }

        ChatRoom chatRoom = ChatRoom.builder()
            .type(RoomType.DIRECT_MESSAGE)
            .createdBy(creatorId)
            .lastActivity(LocalDateTime.now())
            .maxParticipants(2)
            .memberCount(2)
            .isActive(true)
            .settings(ChatRoom.RoomSettings.builder()
                .allowFileSharing(true)
                .allowGuestUsers(false)
                .moderationRequired(false)
                .build())
            .build();

        ChatRoom savedRoom = chatRoomRepository.save(chatRoom);

        // Create participant instances for direct message
        participantService.createParticipant(savedRoom.getId(), creatorId, Participant.Role.OWNER);
        participantService.createParticipant(savedRoom.getId(), request.getParticipantId(), Participant.Role.MEMBER);

        logger.info("Created direct chat room: {} between {} and {}", savedRoom.getId(), savedRoom.getCreatedBy(), request.getParticipantId());

        return savedRoom;
    }

    private ChatRoom createConfigurableRoom(CreateChatRoomRequest request, String creatorId) {
        // Room name presence and format are enforced by CreateChatRoomRequest bean validation
        ChatRoom.RoomSettings settings = request.getSettings() != null
            ? request.getSettings()
            : ChatRoom.RoomSettings.builder()
                .allowFileSharing(false)
                .allowGuestUsers(false)
                .moderationRequired(false)
                .welcomeMessage("")
                .build();

        ChatRoom chatRoom = ChatRoom.builder()
            .name(request.getRoomName())
            .description(request.getDescription())
            .type(request.getRoomType())
            .createdBy(creatorId)
            .lastActivity(LocalDateTime.now())
            .maxParticipants(request.getMaxUsers() != null ? request.getMaxUsers() : -1)
            .memberCount(1)
            .isActive(true)
            .settings(settings)
            .build();

        ChatRoom savedRoom = chatRoomRepository.save(chatRoom);

        // Create participant instance for room creator
        participantService.createParticipant(savedRoom.getId(), creatorId, Participant.Role.OWNER);

        logger.info("Created {} room: {} with creator: {}", request.getRoomType(), savedRoom.getId(), creatorId);

        return savedRoom;
    }

    public ChatRoom findById(String roomId) {
        return chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
    }

    /**
     * Soft-deletes the room: it is marked inactive, every membership is removed (which also revokes STOMP
     * authorization for the room), and a SYSTEM message is broadcast to the room topic.
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
        messagingTemplate.convertAndSend("/topic/public/" + roomId, ChatMessageResponse.builder()
            .chatRoomId(roomId)
            .senderId(authenticatedUser.getId())
            .senderName(authenticatedUser.getName())
            .content(ROOM_DELETED_MESSAGE)
            .type(Message.MessageType.SYSTEM)
            .createdAt(now)
            .updatedAt(now)
            .isUpdated(false)
            .isDeleted(false)
            .build());

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

        if (room.getType() == RoomType.DIRECT_MESSAGE && request.getMaxUsers() != null) {
            throw new InvalidRequestException("Cannot change max users for direct message rooms");
        }

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

        // Prevent leaving direct message rooms
        if(room.getType() == RoomType.DIRECT_MESSAGE) {
            throw new ForbiddenActionException("Cannot leave direct message rooms. Please delete the room instead.");
        }

        // Prevent room creator from leaving - they must delete the room or transfer ownership first
        if(room.getCreatedBy().equals(authenticatedUser.getId())) {
            throw new ForbiddenActionException("Room creator cannot leave the room. Please delete the room or transfer ownership first.");
        }

        if (!participantService.removeParticipant(roomId, authenticatedUser.getId())) {
            throw new UnauthorizedRoomActionException("User is not a participant of this room");
        }

        logger.info("User {} successfully left room {}", authenticatedUser.getId(), roomId);
    }
}
