package com.lnt.chatmee.service;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DatabaseOperationException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;

import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ChatRoomService {

    private static final Logger logger = LoggerFactory.getLogger(ChatRoomService.class);
    
    private final ChatRoomRepository chatRoomRepository;
    private final ParticipantRepository participantRepository;

    public ChatRoom createRoom(CreateChatRoomRequest request) {

        switch (request.getRoomType()) {
            case DIRECT_MESSAGE:
                return createDirectRoom(request);
            case PRIVATE:
            case PUBLIC:
                return createConfigurableRoom(request);
        
            default:
                throw new IllegalArgumentException("Invalid room type: " + request.getRoomType());
        }
    }

    private ChatRoom createDirectRoom(CreateChatRoomRequest request) {
        try {
            if(request.getParticipantId() == null || request.getParticipantId().trim().isEmpty()) {
                throw new IllegalArgumentException("Participant ID is required for direct message");
            }
            if(request.getCreatedBy().equals(request.getParticipantId())) {
                throw new IllegalArgumentException("Cannot create direct message with yourself");
            }

            Set<String> participants = new HashSet<>();
            participants.add(request.getCreatedBy());
            participants.add(request.getParticipantId());
            
            String roomId = UUID.randomUUID().toString();

            ChatRoom chatRoom = ChatRoom.builder()
                .id(roomId)
                .type(RoomType.DIRECT_MESSAGE)
                .createdBy(request.getCreatedBy())
                .participants(participants)
                .createdAt(LocalDateTime.now())
                .lastActivity(LocalDateTime.now())
                .maxParticipants(2)
                .isActive(true)
                .settings(ChatRoom.RoomSettings.builder()
                    .allowFileSharing(true)
                    .allowGuestUsers(false)
                    .moderationRequired(false)
                    .build())
                .build();

            ChatRoom savedRoom = chatRoomRepository.save(chatRoom);
            logger.info("Created direct chat room: {} between {} and {}", savedRoom.getId(), savedRoom.getCreatedBy(), request.getParticipantId());

            return savedRoom;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (DataAccessException e) {
            logger.error("Database error while creating room", e);
            throw new DatabaseOperationException("Failed to create room in database", e);
        } catch (Exception e) {
            logger.error("Unexpected error while creating room", e);
            throw new DatabaseOperationException("Unexpected error during room creation", e);
        }
    }

    private ChatRoom createConfigurableRoom(CreateChatRoomRequest request) {
        try {
            Set<String> participants = new HashSet<>();
            participants.add(request.getCreatedBy());
            String roomId = UUID.randomUUID().toString();

            ChatRoom chatRoom = ChatRoom.builder()
                .id(roomId)
                .name(request.getRoomName())
                .description(request.getDescription())
                .type(request.getRoomType())
                .createdBy(request.getCreatedBy())
                .createdAt(LocalDateTime.now())
                .lastActivity(LocalDateTime.now())
                .participants(participants)
                .maxParticipants(request.getMaxUsers() != null ? request.getMaxUsers() : -1)
                .admins(java.util.Collections.singleton(request.getCreatedBy()))
                .isActive(true)
                .settings(ChatRoom.RoomSettings.builder()
                    .allowFileSharing(true)
                    .allowGuestUsers(false)
                    .moderationRequired(false)
                    .build())
                .build();

            ChatRoom savedRoom = chatRoomRepository.save(chatRoom);
            logger.info("Created {} room: {} - {} with creator: {}", request.getRoomType(), savedRoom.getId(), request.getRoomName(), request.getCreatedBy());

            return savedRoom;
        } catch (DataAccessException e) {
            logger.error("Database error while creating room", e);
            throw new DatabaseOperationException("Failed to create room in database", e);
        } catch (Exception e) {
            logger.error("Unexpected error while creating room", e);
            throw new DatabaseOperationException("Unexpected error during room creation", e);
        }
    }

    public ChatRoom findById(String roomId) {
        return chatRoomRepository.findById(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
    }

    @Transactional
    public void addParticipant(String roomId, String userId, Role role) {
        try {
            ChatRoom room = findById(roomId);

            if(participantRepository.existsByChatRoomIdAndUserId(roomId, userId)) {
                throw new UserAlreadyInRoomException("User is already in the room");
            }

            if(room.getMaxParticipants() > 0) {
                Long currentCount = participantRepository.countByChatRoomId(roomId);
                if(currentCount >= room.getMaxParticipants()) {
                    throw new RoomCapacityExceededException("Room has reached maximum capacity");
                }
            }

            String participantId = UUID.randomUUID().toString();
            Participant participant = Participant.builder()
                .id(participantId)
                .chatRoomId(roomId)
                .userId(userId)
                .role(role)
                .joinedAt(LocalDateTime.now())
                .lastSeenAt(LocalDateTime.now())
                .isMuted(false)
                .isBlocked(false)
                .build();
            
            participantRepository.save(participant);
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

    @Transactional
    public void deleteRoom(String roomId, String userId) {
        try {
            ChatRoom room = findById(roomId);

            if (!room.getCreatedBy().equals(userId)) {
                throw new UnauthorizedRoomActionException("Only room creator can delete the room");
            }

            room.setActive(false);
            chatRoomRepository.save(room);
            logger.info("Room {} deleted by user {}", roomId, userId);
            
        } catch (ChatRoomNotFoundException | UnauthorizedRoomActionException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Unexpected error while deleting room", e);
            throw new DatabaseOperationException("Failed to delete room", e);
        }
    }
}
