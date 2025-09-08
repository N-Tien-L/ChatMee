package com.lnt.chatmee.dto.response;


import java.time.LocalDateTime;

import com.lnt.chatmee.model.ChatRoom.RoomSettings;
import com.lnt.chatmee.model.ChatRoom.RoomType;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CreateChatRoomResponse {
    private String id;
    private String roomName;
    private RoomType roomType;
    private String description;
    private String createdBy;
    private LocalDateTime createdAt;
    private int maxUsers;
    private RoomSettings settings;
}
