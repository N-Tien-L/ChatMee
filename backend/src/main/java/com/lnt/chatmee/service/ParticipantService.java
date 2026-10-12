package com.lnt.chatmee.service;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.dao.DuplicateKeyException;

import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.MemberResponse;
import org.springframework.beans.factory.ObjectProvider;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.util.ValidationUtil;

import com.lnt.chatmee.service.policy.RoomTypePolicyRegistry;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ParticipantService {

    private static final Logger logger = LoggerFactory.getLogger(ParticipantService.class);

    private final ParticipantRepository participantRepository;
    private final UserRepository userRepository;
    private final UserEventPublisher userEvents;
    private final ChatRoomRepository chatRoomRepository;
    private final RoomTypePolicyRegistry policies;
    // Resolve on membership changes only: MessageService also uses the membership guard.
    private final ObjectProvider<MessageService> messages;

    public void createParticipant(String chatRoomId, String userId, Role role) {
        // Validate inputs
        ValidationUtil.validateId(chatRoomId, "Chat Room ID");
        ValidationUtil.validateId(userId, "User ID");
        if (role == null) {
            throw new InvalidRequestException("Role cannot be null");
        }

        // id, joinedAt and updatedAt are filled by MongoDB and Spring Data auditing on insert
        Participant participant = Participant.builder()
            .chatRoomId(chatRoomId)
            .userId(userId)
            .role(role)
            .lastReadAt(Instant.now())
            .lastSeenAt(LocalDateTime.now())
            .isMuted(false)
            .isBlocked(false)
            .build();

        try {
            participantRepository.save(participant);
        } catch (DuplicateKeyException ex) {
            throw new UserAlreadyInRoomException("User is already in the room");
        }
        logger.info("Created participant: {} for room: {} with role: {}", userId, chatRoomId, role);
    }

    public void joinRoom(String roomId, String userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        ValidationUtil.validateId(roomId, "Room ID");
        ChatRoom room = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
        policies.get(room.getType()).checkJoin();
        addParticipant(roomId, user.getId(), Role.MEMBER);
        chatRoomRepository.findByIdAndIsActiveTrue(roomId).ifPresent(joinedRoom ->
            userEvents.roomAdded(user.getId(), ChatRoomResponse.from(
                joinedRoom, getParticipantUserIds(roomId), null, 0, Role.MEMBER)));
    }

    public void addParticipant(String roomId, String userId, String targetUserId, String requestedRole) {
        User actor = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        Participant participant = participantRepository.findByChatRoomIdAndUserId(roomId, actor.getId())
            .orElseThrow(() -> new ForbiddenActionException("User is not a participant of the chat room"));
        Role actorRole = participant.getRole();
        if (actorRole != Role.ADMIN && actorRole != Role.OWNER) {
            throw new ForbiddenActionException("Only ADMIN or OWNER can add participants to the chat room");
        }
        Role role = Role.MEMBER;
        if (requestedRole != null && !requestedRole.trim().isEmpty()) {
            try {
                role = Role.valueOf(requestedRole.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new InvalidRequestException("Invalid role specified: " + requestedRole);
            }
        }
        if (role == Role.OWNER || (actorRole == Role.ADMIN && role != Role.MEMBER)) {
            throw new ForbiddenActionException("The requested role cannot be assigned by this participant");
        }
        addParticipant(roomId, targetUserId, role);
    }

    /**
     * Adds a member without a multi-document transaction: a seat is reserved with a conditional {@code $inc}
     * on the room, then the participant row is inserted (the unique index rejects duplicates), and the seat
     * is given back if the insert fails. See ADR-0005.
     */
    public void addParticipant(String roomId, String userId, Role role) {
        // Validate IDs
        ValidationUtil.validateId(roomId, "Room ID");
        ValidationUtil.validateId(userId, "User ID");

        ChatRoom room = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
        policies.get(room.getType()).checkAddParticipant();

        User target = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Participant not found"));

        if(participantRepository.existsByChatRoomIdAndUserId(roomId, userId)) {
            throw new UserAlreadyInRoomException("User is already in the room");
        }

        if (chatRoomRepository.reserveSeat(roomId, LocalDateTime.now()) == 0) {
            throw new RoomCapacityExceededException("Room has reached maximum capacity");
        }

        try {
            createParticipant(roomId, userId, role);
        } catch (RuntimeException ex) {
            chatRoomRepository.releaseSeat(roomId, LocalDateTime.now());
            throw ex;
        }
        messages.getObject().postSystemMessage(roomId, displayName(target) + " joined");
        logger.info("Added participant {} to room {}", userId, roomId);
    }

    /**
     * Removes a member and gives the seat back.
     *
     * @return true if the user was a member
     */
    public boolean removeParticipant(String roomId, String userId) {
        if (participantRepository.deleteByChatRoomIdAndUserId(roomId, userId) == 0) {
            return false;
        }
        chatRoomRepository.releaseSeat(roomId, LocalDateTime.now());
        logger.info("Removed participant {} from room {}", userId, roomId);
        return true;
    }

    /** Deletes every membership of a room (used when the room is soft-deleted). */
    public long removeAllParticipants(String roomId) {
        return participantRepository.deleteByChatRoomId(roomId);
    }

    public Set<String> getParticipantUserIds(String roomId) {
        return participantRepository.findByChatRoomId(roomId).stream()
            .map(Participant::getUserId)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** Member user ids per room id, in one query; rooms without members are absent from the map. */
    public Map<String, Set<String>> getParticipantUserIds(Collection<String> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }
        return participantRepository.findByChatRoomIdIn(roomIds).stream()
            .collect(Collectors.groupingBy(Participant::getChatRoomId,
                Collectors.mapping(Participant::getUserId, Collectors.toCollection(LinkedHashSet::new))));
    }

    public List<Participant> getMemberships(String userId) {
        return participantRepository.findByUserId(userId);
    }

    public void markRead(String roomId, String userId) {
        if (chatRoomRepository.findByIdAndIsActiveTrue(roomId).isEmpty()
                || (participantRepository.markRead(roomId, userId, Instant.now()) == 0
                    && !participantRepository.existsByChatRoomIdAndUserId(roomId, userId))) {
            throw new ChatRoomNotFoundException("Room membership not found");
        }
    }

    public List<String> getRoomIdsOfUser(String userId) {
        return participantRepository.findByUserId(userId).stream()
            .map(Participant::getChatRoomId)
            .toList();
    }

    /** Shared access guard: a late membership insert must not authorize a soft-deleted room. */
    public boolean isUserParticipant(String roomId, String userId) {
        return chatRoomRepository.findByIdAndIsActiveTrue(roomId).isPresent()
            && participantRepository.existsByChatRoomIdAndUserId(roomId, userId);
    }

    public List<MemberResponse> getMembers(String roomId, String callerId) {
        chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        List<Participant> members = participantRepository.findByChatRoomId(roomId);
        if (members.stream().noneMatch(row -> callerId.equals(row.getUserId()))) {
            throw new ChatRoomNotFoundException("Room membership not found");
        }
        Map<String, User> users = new java.util.HashMap<>();
        userRepository.findAllById(members.stream().map(Participant::getUserId).collect(Collectors.toSet()))
            .forEach(user -> users.put(user.getId(), user));
        return members.stream().map(row -> {
            User user = users.get(row.getUserId());
            return new MemberResponse(row.getUserId(), displayName(user), user == null ? null : user.getAvatarUrl(), row.getRole());
        }).toList();
    }

    public void removeMember(String roomId, String callerId, String targetId) {
        ChatRoom room = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        Participant actor = participantRepository.findByChatRoomIdAndUserId(roomId, callerId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        Participant target = participantRepository.findByChatRoomIdAndUserId(roomId, targetId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room member not found"));
        policies.get(room.getType()).checkRemoveMember(callerId, actor.getRole(), targetId, target.getRole());
        String actorName = displayName(userRepository.findById(callerId).orElse(null));
        String targetName = displayName(userRepository.findById(targetId).orElse(null));
        if (!removeParticipant(roomId, targetId)) {
            throw new ChatRoomNotFoundException("Room member not found");
        }
        userEvents.roomRemoved(Set.of(targetId), roomId, "REMOVED");
        messages.getObject().postSystemMessage(roomId, actorName + " removed " + targetName);
    }

    public void postLeaveMessage(String roomId, String name) {
        messages.getObject().postSystemMessage(roomId, (name == null || name.isBlank() ? "Deleted user" : name) + " left");
    }

    private static String displayName(User user) {
        return user == null || user.getName() == null || user.getName().isBlank() ? "Deleted user" : user.getName();
    }

}
