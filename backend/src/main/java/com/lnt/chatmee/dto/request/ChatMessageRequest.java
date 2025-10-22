package com.lnt.chatmee.dto.request;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import com.lnt.chatmee.model.Message.MessageType;

import lombok.Data;

@Data
public class ChatMessageRequest {
    
    @NotBlank(message = "Room ID is required")
    private String roomId;

    @NotBlank(message = "Message content is required")
    @Size(max = 5000, message = "Message content must not exceed 5000 characters")
    private String content;

    @NotNull(message = "Message type is required")
    private MessageType messageType = MessageType.TEXT; // default to TEXT

    private String senderId;  // User ID sending the message
    private String senderName;

    private String tempId;
}
