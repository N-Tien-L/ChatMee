package com.lnt.chatmee.dto.response;

import java.time.LocalDateTime;

import com.lnt.chatmee.model.ChatRoom;

/** Public metadata of a joinable room; deliberately has no participant list and no creator. */
public record PublicRoomSummary(
    String id,
    String name,
    String description,
    int memberCount,
    int maxMembers,
    LocalDateTime createdAt
) {
    public static PublicRoomSummary from(ChatRoom room) {
        return new PublicRoomSummary(room.getId(), room.getName(), room.getDescription(), room.getMemberCount(),
                room.getMaxParticipants(), room.getCreatedAt());
    }
}
