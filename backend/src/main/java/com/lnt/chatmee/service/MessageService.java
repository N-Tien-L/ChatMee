package com.lnt.chatmee.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.dao.DataAccessException;
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
}
