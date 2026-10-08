package com.lnt.chatmee.dto.response;

import com.lnt.chatmee.model.Message.MessageType;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.Getter;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatMessageResponse {
    
    private String id;
    private String tempId;
    private String chatRoomId;
    private String senderId;
    private String senderName;
    private String content;
    private MessageType type;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Instant createdAt;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Instant updatedAt;
    @Getter(onMethod_ = @JsonProperty("isUpdated"))
    private boolean isUpdated;
    @Getter(onMethod_ = @JsonProperty("isDeleted"))
    private boolean isDeleted;
    
}
