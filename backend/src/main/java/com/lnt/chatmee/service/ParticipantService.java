package com.lnt.chatmee.service;

import java.time.LocalDateTime;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.lnt.chatmee.exception.DatabaseOperationException;
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
        try {
            // Validate inputs
            ValidationUtil.validateId(chatRoomId, "Chat Room ID");
            ValidationUtil.validateId(userId, "User ID");
            if (role == null) {
                throw new IllegalArgumentException("Role cannot be null");
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
            
            participantRepository.save(participant);
            logger.info("Created participant: {} for room: {} with role: {}", userId, chatRoomId, role);
            
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Failed to create participant for user: {} in room: {}", userId, chatRoomId, e);
            throw new DatabaseOperationException("Failed to create participant", e);
        }
    }
    
    @Transactional
    public void joinRoom(String roomId, String provider, String providerId) {
        try {
            // Get the authenticated user
            User user = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
            
            // Add user as MEMBER to the room
            addParticipant(roomId, user.getId(), Role.MEMBER);
            
        } catch (Exception e) {
            logger.error("Failed to join room {} for user {}/{}", roomId, provider, providerId, e);
            throw new DatabaseOperationException("Failed to join room", e);
        }
    }
    
    @Transactional
    public void addParticipant(String roomId, String userId, Role role) {
        try {
            // Validate IDs
            ValidationUtil.validateId(roomId, "Room ID");
            ValidationUtil.validateId(userId, "User ID");
            
            ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Can't find chat room with id: " + roomId));

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
            
        } catch (UserAlreadyInRoomException | RoomCapacityExceededException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Unexpected error while adding participant", e);
            throw new DatabaseOperationException("Failed to add participant", e);
        }
    }

    public boolean isUserParticipant(String roomId, String userId) {
        return participantRepository.findByChatRoomIdAndUserId(roomId, userId).isPresent();
    }
}
