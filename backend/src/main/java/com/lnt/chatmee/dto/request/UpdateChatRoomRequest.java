package com.lnt.chatmee.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import com.lnt.chatmee.dto.validation.RoomName;
import com.lnt.chatmee.model.ChatRoom.RoomSettings;

import lombok.Data;

@Data
public class UpdateChatRoomRequest {
    @RoomName
    private String roomName;

    @Size(max = 500, message = "Description must not exceed 500 characters")
    private String description;

    @Min(value = 2, message = "Maximum users must be at least 2")
    @Max(value = 1000, message = "Maximum users cannot exceed 1000")
    private Integer maxUsers;
    
    private RoomSettings settings;
}
