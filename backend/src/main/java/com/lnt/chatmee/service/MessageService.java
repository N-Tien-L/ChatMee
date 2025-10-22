package com.lnt.chatmee.service;

import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DatabaseOperationException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.model.Message;
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
    private final ParticipantRepository participantRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    
    public List<ChatMessageResponse> getRecentMessages(String roomId, String userId) {
        if(!chatRoomRepository.existsById(roomId)) {
            throw new ChatRoomNotFoundException("Chat room not found: " + roomId);
        }

        if(!participantRepository.existsByChatRoomIdAndUserId(roomId, userId)) {
            throw new ForbiddenActionException("You are not a participant of this room");
        }

        try {
            List<Message> messages = messageRepository.findTop50ByChatRoomIdAndIsDeletedFalseOrderByCreatedAtDesc(roomId);
            return messages.stream().map(this::convertToResponse).collect((Collectors.toList()));
        } catch (DataAccessException e) {
            throw new DatabaseOperationException("Failed to fetch messages", e);
        }
    }

    private ChatMessageResponse convertToResponse(Message message) {
        // Get sender name
        String senderName = userRepository.findById(message.getSenderId())
            .map(User::getName)
            .orElse("Unknown User");
            
        return ChatMessageResponse.builder()
            .id(message.getId())
            .chatRoomId(message.getChatRoomId())
            .senderId(message.getSenderId())
            .senderName(senderName)
            .content(message.getContent())
            .type(message.getType())
            .createdAt(message.getCreatedAt().toString()) 
            .updatedAt(message.getUpdatedAt().toString()) 
            .isUpdated(message.isUpdated())
            .isDeleted(message.isDeleted())
            .build();
    }

    /**
     * Asynchronously persist a message to the database.
     * This method runs on a separate thread pool to avoid blocking the WebSocket message broker.
     */
    @Async("messageIOExecutor")
    public void persistMessageAsync(Message message) {
        try {
            messageRepository.save(message);
            logger.debug("Message {} persisted asynchronously", message.getId());
        } catch (Exception e) {
            logger.error("Failed to persist message {} asynchronously", message.getId(), e);
            // You could add retry logic or dead-letter queue here if needed
        }
    }
}
