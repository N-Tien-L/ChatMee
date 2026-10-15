package com.lnt.chatmee.dto.response;


import java.time.LocalDateTime;
import java.time.Instant;
import java.time.ZoneId;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.lnt.chatmee.dto.event.LastMessageSummary;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.RoomState;
import java.util.Set;

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
    RoomSettingsResponse settings,
    Set<String> participants,
    /** DIRECT_MESSAGE rooms only: the other member, from the caller's point of view; null otherwise. */
    UserSummaryResponse counterpart,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant lastActivityAt,
    LastMessageSummary lastMessage,
    long unreadCount,
    Role myRole,
    /** ACTIVE, or REQUESTED for a DM waiting for the recipient (shown to the sender only, AC-009-11). */
    RoomState state,
    /** DIRECT_MESSAGE rooms only: true when the caller blocked the other member; never shown to the blocked user (AC-009-19). */
    boolean blocked
) {
    public static ChatRoomResponse from(com.lnt.chatmee.model.ChatRoom room, Set<String> participants) {
        return from(room, participants, null);
    }

    public static ChatRoomResponse from(com.lnt.chatmee.model.ChatRoom room, Set<String> participants,
            UserSummaryResponse counterpart) {
        return from(room, participants, counterpart, 0, null);
    }

    public static Instant activityAt(com.lnt.chatmee.model.ChatRoom room) {
        return room.getLastActivityAt() != null ? room.getLastActivityAt()
            : room.getCreatedAt() == null ? null : room.getCreatedAt().atZone(ZoneId.systemDefault()).toInstant();
    }

    public static ChatRoomResponse from(com.lnt.chatmee.model.ChatRoom room, Set<String> participants,
            UserSummaryResponse counterpart, long unreadCount, Role myRole) {
        return from(room, participants, counterpart, unreadCount, myRole, false);
    }

    public static ChatRoomResponse from(com.lnt.chatmee.model.ChatRoom room, Set<String> participants,
            UserSummaryResponse counterpart, long unreadCount, Role myRole, boolean blocked) {
        return new ChatRoomResponse(room.getId(), room.getName(), room.getType(), room.getDescription(),
                room.getCreatedBy(), room.getCreatedAt(), room.getLastActivity(), room.getMaxParticipants(),
                RoomSettingsResponse.from(room.getSettings()), participants, counterpart, activityAt(room), room.getLastMessage(), unreadCount, myRole,
                room.getState(), blocked);
    }
}
