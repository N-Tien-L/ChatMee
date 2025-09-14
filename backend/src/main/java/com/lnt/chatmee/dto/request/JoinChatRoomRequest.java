package com.lnt.chatmee.dto.request;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class JoinChatRoomRequest {
    
    @NotBlank(message = "User ID is required")
    @Size(min = 1, max = 255, message = "User ID must be between 1 and 255 characters")
    private String userId;
    
    // Optional: For admin adding users, they can specify role
    // If not provided, defaults to MEMBER
    private String role; // "MEMBER", "ADMIN", etc.
}