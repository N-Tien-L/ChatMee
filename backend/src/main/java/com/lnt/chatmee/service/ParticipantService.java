package com.lnt.chatmee.service;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Transactional;

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

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ParticipantService {

    private static final Logger logger = LoggerFactory.getLogger(ParticipantService.class);

    private final ParticipantRepository participantRepository;
    private final UserRepository userRepository;
    private final ChatRoomRepository chatRoomRepository;

    public void createParticipant(String chatRoomId, String userId, Role role) {
        // Validate inputs
        ValidationUtil.validateId(chatRoomId, "Chat Room ID");
        ValidationUtil.validateId(userId, "User ID");
        if (role == null) {
            throw new InvalidRequestException("Role cannot be null");
        }

        Participant participant = Participant.builder()
            .id(UUID.randomUUID().toString())
            .chatRoomId(chatRoomId)
            .userId(userId)
            .role(role)
            .joinedAt(LocalDateTime.now())
            .lastSeenAt(LocalDateTime.now())
            .isMuted(false)
            .isBlocked(false)
            .updatedAt(LocalDateTime.now())
            .build();

        try {
            participantRepository.save(participant);
        } catch (DuplicateKeyException ex) {
            throw new UserAlreadyInRoomException("User is already in the room");
        }
        logger.info("Created participant: {} for room: {} with role: {}", userId, chatRoomId, role);
    }

    @Transactional
    public void joinRoom(String roomId, String provider, String providerId) {
        User user = userRepository.findByProviderAndProviderId(provider, providerId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        ValidationUtil.validateId(roomId, "Room ID");
        ChatRoom room = chatRoomRepository.findById(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
        if (room.getType() != ChatRoom.RoomType.PUBLIC) {
            throw new ForbiddenActionException("Only PUBLIC rooms can be joined");
        }
        addParticipant(roomId, user.getId(), Role.MEMBER);
    }

    @Transactional
    public void addParticipant(String roomId, String provider, String providerId, String targetUserId, String requestedRole) {
        User actor = userRepository.findByProviderAndProviderId(provider, providerId)
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

    @Transactional
    public void addParticipant(String roomId, String userId, Role role) {
        // Validate IDs
        ValidationUtil.validateId(roomId, "Room ID");
        ValidationUtil.validateId(userId, "User ID");

        ChatRoom room = chatRoomRepository.findById(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));

        if(userRepository.findById(userId).isEmpty()) {
            throw new UserNotFoundException("Participant not found");
        }

        if(participantRepository.existsByChatRoomIdAndUserId(roomId, userId)) {
            throw new UserAlreadyInRoomException("User is already in the room");
        }

        if(room.getMaxParticipants() > 0) {
            Long currentCount = participantRepository.countByChatRoomId(roomId);
            if(currentCount >= room.getMaxParticipants()) {
                throw new RoomCapacityExceededException("Room has reached maximum capacity");
            }
        }

        createParticipant(roomId, userId, role);
        logger.info("Added participant {} to room {}", userId, roomId);

        // Update room's participants set and last activity
        room.getParticipants().add(userId);
        room.setLastActivity(LocalDateTime.now());
        chatRoomRepository.save(room);
    }

    public boolean isUserParticipant(String roomId, String userId) {
        return participantRepository.existsByChatRoomIdAndUserId(roomId, userId);
    }
}
