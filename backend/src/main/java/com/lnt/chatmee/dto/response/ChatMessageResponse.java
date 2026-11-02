package com.lnt.chatmee.dto.response;

import com.lnt.chatmee.model.Message.MessageType;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.Builder;

@Builder
public record ChatMessageResponse(
    String id,
    /** The sender's tempId from the request that produced this broadcast; null in history. */
    String tempId,
    /** The stored client id; history carries it so a resync merges with the pending copy. */
    String clientMessageId,
    String chatRoomId,
    String senderId,
    String senderName,
    String content,
    MessageType type,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant updatedAt,
    @JsonProperty("isUpdated") boolean isUpdated,
    @JsonProperty("isDeleted") boolean isDeleted,
    /** The quoted target (SPEC-014); null when this message is not a reply. */
    ReplyToResponse replyTo
) {
    public static ChatMessageResponse from(com.lnt.chatmee.model.Message message, String senderName, String tempId) {
        return from(message, senderName, tempId, false);
    }

    /** {@code replyTargetDeleted} redacts the quote preview once the original is gone (AC-014-5). */
    public static ChatMessageResponse from(com.lnt.chatmee.model.Message message, String senderName, String tempId,
            boolean replyTargetDeleted) {
        return new ChatMessageResponse(message.getId(), tempId, message.getClientMessageId(), message.getChatRoomId(),
                message.getSenderId(), senderName, message.getContent(), message.getType(), message.getCreatedAt(),
                message.getUpdatedAt(), message.isUpdated(), message.isDeleted(),
                ReplyToResponse.from(message.getReplyTo(), replyTargetDeleted));
    }
}
