package com.lnt.chatmee.dto.response;

import com.lnt.chatmee.model.Message.MessageType;

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
    private String createdAt;
    private String updatedAt;
    private boolean isUpdated;
    private boolean isDeleted;
    
}
