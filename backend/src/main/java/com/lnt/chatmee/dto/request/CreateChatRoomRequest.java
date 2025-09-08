package com.lnt.chatmee.dto.request;

import com.lnt.chatmee.model.ChatRoom.RoomSettings;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import javax.validation.constraints.Min;
import javax.validation.constraints.Max;

import lombok.Data;

@Data
public class CreateChatRoomRequest {
    
    @NotNull(message = "Room type is required")
    private RoomType roomType;
    
    @NotBlank(message = "Creator ID is required")
    @Size(min = 1, max = 255, message = "Creator ID must be between 1 and 255 characters")
    private String createdBy;

    // for direct chat
    @Size(max = 255, message = "Participant ID must not exceed 255 characters")
    private String participantId;

    // for private/public chat
    @Size(max = 100, message = "Room name must not exceed 100 characters")
    private String roomName;
    
    @Size(max = 500, message = "Description must not exceed 500 characters")
    private String description;
    
    @Min(value = 2, message = "Maximum users must be at least 2")
    @Max(value = 1000, message = "Maximum users cannot exceed 1000")
    private Integer maxUsers;
    
    private RoomSettings settings;
}
