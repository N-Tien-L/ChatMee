package com.lnt.chatmee.dto.response;

import com.lnt.chatmee.model.Message.MessageType;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.Builder;

@Builder
public record ChatMessageResponse(
    String id,
    String tempId,
    String chatRoomId,
    String senderId,
    String senderName,
    String content,
    MessageType type,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant updatedAt,
    @JsonProperty("isUpdated") boolean isUpdated,
    @JsonProperty("isDeleted") boolean isDeleted
) {
    public static ChatMessageResponse from(com.lnt.chatmee.model.Message message, String senderName, String tempId) {
        return new ChatMessageResponse(message.getId(), tempId, message.getChatRoomId(), message.getSenderId(),
                senderName, message.getContent(), message.getType(), message.getCreatedAt(), message.getUpdatedAt(),
                message.isUpdated(), message.isDeleted());
    }
}
