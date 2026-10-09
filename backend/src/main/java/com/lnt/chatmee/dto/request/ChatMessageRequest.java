package com.lnt.chatmee.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

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

    private String tempId;

    /** SYSTEM (and future media) messages are created by the server only; clients send TEXT. */
    @JsonIgnore
    @AssertTrue(message = "Only TEXT messages can be sent")
    public boolean isTextMessage() {
        return messageType == null || messageType == MessageType.TEXT;
    }
}
