package com.lnt.chatmee.dto.request;

import com.lnt.chatmee.model.ChatRoom.RoomSettings;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import javax.validation.constraints.NotNull;

import lombok.Data;

@Data
public class CreateChatRoomRequest {
    
    @NotNull(message = "Room type is required")
    private RoomType roomType;
    private String createdBy;

    // for direct chat
    private String participantId;

    // for private/public chat
    private String roomName;
    private String description;
    private Integer maxUsers;
    private RoomSettings settings;
}
