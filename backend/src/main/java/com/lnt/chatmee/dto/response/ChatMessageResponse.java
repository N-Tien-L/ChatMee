package com.lnt.chatmee.dto.response;

import java.time.LocalDateTime;

import com.lnt.chatmee.model.Message.MessageType;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatMessageResponse {
    
    private String id;
    private String roomId;
    private String senderId;
    private String senderName;
    private String content;
    private MessageType messageType;
    private LocalDateTime timestamp;
    private boolean isOwn;
    
}
