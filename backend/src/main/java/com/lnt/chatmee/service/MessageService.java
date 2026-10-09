package com.lnt.chatmee.service;

import java.util.List;
import java.util.UUID;
import java.time.Instant;
import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.exception.UserNotFoundException;
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

    public ChatMessageResponse sendMessage(ChatMessageRequest request, String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        if (!participantRepository.existsByChatRoomIdAndUserId(request.getRoomId(), userId)) {
            throw new ForbiddenActionException("Room membership required");
        }
        Message message = Message.builder()
                .id(UUID.randomUUID().toString())
                .chatRoomId(request.getRoomId()).senderId(userId)
                .type(request.getMessageType()).content(request.getContent())
                .createdAt(Instant.now()).updatedAt(Instant.now())
                .isUpdated(false).isDeleted(false).build();
        // Only the successfully persisted message may be acknowledged to the room.
        Message saved = persistMessage(message);
        ChatMessageResponse response = ChatMessageResponse.from(saved, user.getName(), request.getTempId());

        return response;
    }

    public List<ChatMessageResponse> getRecentMessages(String roomId, String userId) {
        userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
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

        return ChatMessageResponse.from(message, senderName, null);
    }

    /** Persist synchronously; callers may broadcast only the returned saved message. */
    public Message persistMessage(Message message) {
        try {
            return messageRepository.save(message);
        } catch (DataAccessException ex) {
            throw new DatabaseOperationException("Failed to save message", ex);
        }
    }
}
