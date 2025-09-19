package com.lnt.chatmee.service;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DatabaseOperationException;
import com.lnt.chatmee.exception.IllegalArgumentException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.util.ValidationUtil;

import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ChatRoomService {

    private static final Logger logger = LoggerFactory.getLogger(ChatRoomService.class);
    
    private final ChatRoomRepository chatRoomRepository;
    private final UserRepository userRepository;
    private final ParticipantService participantService;

    public ChatRoomResponse createRoom(CreateChatRoomRequest request, String provider, String providerId) {

        User AuthenticatedUser = userRepository.findByProviderAndProviderId(provider, providerId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        ChatRoom room;
        switch (request.getRoomType()) {
            case DIRECT_MESSAGE:
                room = createDirectRoom(request, AuthenticatedUser.getId());
                break;
            case PRIVATE:
            case PUBLIC:
                room = createConfigurableRoom(request, AuthenticatedUser.getId());
                break;
            default:
                throw new IllegalArgumentException("Invalid room type: " + request.getRoomType());
        }

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
            .participants(room.getParticipants())
            .build();
    }

    private ChatRoom createDirectRoom(CreateChatRoomRequest request, String creatorId) {
        try {
            // Validate participant ID
            ValidationUtil.validateId(request.getParticipantId(), "Participant ID");
            if(userRepository.findById(request.getParticipantId()).isEmpty()) {
                throw new UserNotFoundException("Participant not found");
            }
            if(creatorId.equals(request.getParticipantId())) {
                throw new IllegalArgumentException("Cannot create direct message with yourself");
            }

            Set<String> participants = new HashSet<>();
            participants.add(creatorId);
            participants.add(request.getParticipantId());
            
            String roomId = UUID.randomUUID().toString();

            ChatRoom chatRoom = ChatRoom.builder()
                .id(roomId)
                .type(RoomType.DIRECT_MESSAGE)
                .createdBy(creatorId)
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
            
            // Create participant instances for direct message
            participantService.createParticipant(savedRoom.getId(), creatorId, Participant.Role.OWNER);
            participantService.createParticipant(savedRoom.getId(), request.getParticipantId(), Participant.Role.MEMBER);
            
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

    private ChatRoom createConfigurableRoom(CreateChatRoomRequest request, String creatorId) {
        try {
            // Validate room name for private/public rooms
            boolean isRoomNameRequired = (request.getRoomType() == RoomType.PRIVATE || request.getRoomType() == RoomType.PUBLIC);
            ValidationUtil.validateRoomName(request.getRoomName(), isRoomNameRequired);
            
            Set<String> participants = new HashSet<>();
            participants.add(creatorId);
            String roomId = UUID.randomUUID().toString();

            logger.info("SETTINGS: {}", request.getSettings());

            ChatRoom chatRoom;
            if (request.getSettings() != null) {
                logger.info("CREATING ROOM WITH SETTINGS");
                chatRoom = ChatRoom.builder()
                    .id(roomId)
                    .name(request.getRoomName())
                    .description(request.getDescription())
                    .type(request.getRoomType())
                    .createdBy(creatorId)
                    .createdAt(LocalDateTime.now())
                    .lastActivity(LocalDateTime.now())
                    .participants(participants)
                    .maxParticipants(request.getMaxUsers() != null ? request.getMaxUsers() : -1)
                    .admins(java.util.Collections.singleton(creatorId))
                    .isActive(true)
                    .settings(request.getSettings())
                    .build();
            } else {
                logger.info("CREATING ROOM WITHOUT SETTINGS");
                chatRoom = ChatRoom.builder()
                    .id(roomId)
                    .name(request.getRoomName())
                    .description(request.getDescription())
                    .type(request.getRoomType())
                    .createdBy(creatorId)
                    .createdAt(LocalDateTime.now())
                    .lastActivity(LocalDateTime.now())
                    .participants(participants)
                    .maxParticipants(request.getMaxUsers() != null ? request.getMaxUsers() : -1)
                    .admins(java.util.Collections.singleton(creatorId))
                    .isActive(true)
                    .settings(ChatRoom.RoomSettings.builder()
                        .allowFileSharing(false)
                        .allowGuestUsers(false)
                        .moderationRequired(false)
                        .welcomeMessage("")
                        .build())
                    .build();
            }

            ChatRoom savedRoom = chatRoomRepository.save(chatRoom);
            
            // Create participant instance for room creator
            participantService.createParticipant(savedRoom.getId(), creatorId, Participant.Role.OWNER);
            
            logger.info("Created {} room: {} - {} with creator: {}", request.getRoomType(), savedRoom.getId(), request.getRoomName(), creatorId);

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
    public void deleteChatRoomById(String provider, String providerId, String roomId) {
        try {
            User authenticatedUser = userRepository.findByProviderAndProviderId(provider, providerId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

            // Validate IDs
            ValidationUtil.validateId(roomId, "Room ID");
            
            ChatRoom room = findById(roomId);

            if (!room.getCreatedBy().equals(authenticatedUser.getId())) {
                throw new UnauthorizedRoomActionException("Only room creator can delete the room");
            }

            chatRoomRepository.delete(room);
            logger.info("Room {} deleted by user {}", roomId, authenticatedUser.getId());
            
        } catch (ChatRoomNotFoundException | UnauthorizedRoomActionException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Unexpected error while deleting room", e);
            throw new DatabaseOperationException("Failed to delete room", e);
        }
    }

    @Transactional(readOnly = true)
    public List<ChatRoom> getList(String provider, String providerId) {
        User authenticatedUser = userRepository.findByProviderAndProviderId(provider, providerId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        
        List<ChatRoom> chatRoomList = chatRoomRepository.findByParticipantsContainingAndIsActiveTrue(authenticatedUser.getId());
        return chatRoomList;
    }

    @Transactional
    public ChatRoom getChatRoomById(String provider, String providerId, String roomId) {
        User authenticatedUser = userRepository.findByProviderAndProviderId(provider, providerId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        ChatRoom room = chatRoomRepository.findByIdAndParticipantsContaining(roomId, authenticatedUser.getId())
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId + " or user is not a participant"));

        return room;
    }

    @Transactional
    public ChatRoom updateChatRoomById(String provider, String providerId, String roomId, UpdateChatRoomRequest request) {
        ChatRoom room = getChatRoomById(provider, providerId, roomId);

        User authenticatedUser = userRepository.findByProviderAndProviderId(provider, providerId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

        if(!room.getCreatedBy().equals(authenticatedUser.getId())) {
            throw new UnauthorizedRoomActionException("Only room creator can update the room");
        }

        switch(room.getType()) {
            case DIRECT_MESSAGE:
                validateDirectMessageUpdate(request);
                break;
            case PRIVATE:
            case PUBLIC:
                validateConfigurableRoomUpdate(room, request);
                break;
        }

        // Update room fields if provided in request
        if (request.getRoomName() != null && !request.getRoomName().trim().isEmpty()) {
            room.setName(request.getRoomName().trim());
        }
        
        if (request.getDescription() != null) {
            room.setDescription(request.getDescription().trim());
        }
        
        if (request.getMaxUsers() != null) {
            room.setMaxParticipants(request.getMaxUsers());
        }
        
        if (request.getSettings() != null) {
            room.setSettings(request.getSettings());
        }

        // Update the last activity timestamp
        room.setLastActivity(LocalDateTime.now());

        // Save the updated room to database
        return chatRoomRepository.save(room);
    }

    private void validateDirectMessageUpdate(UpdateChatRoomRequest request) {
        if(request.getMaxUsers() != null) {
            throw new IllegalArgumentException("Cannot change max users for direct message rooms");
        }
    }
    
    private void validateConfigurableRoomUpdate(ChatRoom room, UpdateChatRoomRequest request) {
        if(request.getMaxUsers() != null) {
            Long currentParticipantsCount = (long) room.getParticipants().size();
            if(request.getMaxUsers() < currentParticipantsCount) {
                throw new IllegalArgumentException("Max users cannot be less than current participants");
            }
        }
    }
}
