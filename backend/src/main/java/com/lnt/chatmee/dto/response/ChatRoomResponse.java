package com.lnt.chatmee.dto.response;


import java.time.LocalDateTime;
import java.util.Set;

import com.lnt.chatmee.model.ChatRoom.RoomSettings;
import com.lnt.chatmee.model.ChatRoom.RoomType;

import lombok.Builder;

@Builder
public record ChatRoomResponse(
    String id,
    String roomName,
    RoomType roomType,
    String description,
    String createdBy,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    int maxUsers,
    RoomSettings settings,
    Set<String> participants
) {
    public static ChatRoomResponse from(com.lnt.chatmee.model.ChatRoom room, Set<String> participants) {
        return new ChatRoomResponse(room.getId(), room.getName(), room.getType(), room.getDescription(),
                room.getCreatedBy(), room.getCreatedAt(), room.getLastActivity(), room.getMaxParticipants(),
                room.getSettings(), participants);
    }
}
