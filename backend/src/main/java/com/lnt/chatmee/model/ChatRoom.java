package com.lnt.chatmee.model;

import java.time.LocalDateTime;
import java.time.Instant;
import com.lnt.chatmee.dto.event.LastMessageSummary;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "chat_rooms")
public class ChatRoom {
    
    @Id
    private String id;

    private String name;

    private String description;

    private String createdBy;

    @CreatedDate

    private LocalDateTime createdAt;

    private LocalDateTime lastActivity;

    private Instant lastActivityAt;

    private LastMessageSummary lastMessage;

    private RoomType type;

    private int maxParticipants; // -1 for unlimited


    /**

     * Number of rows in the participants collection for this room. It is changed only through the atomic

     * conditional updates in ChatRoomRepository so that concurrent joins cannot exceed maxParticipants.

     * The participants collection stays the source of truth for who the members are.

     */

    private int memberCount;

    private boolean isActive;

    /**
     * Only on active DIRECT_MESSAGE rooms (REQUESTED or ACTIVE): the two user ids, sorted and joined with ':'. The
     * unique sparse index allows one DM per pair; soft delete, decline and expiry unset it so the pair can start again.
     */
    @Indexed(unique = true, sparse = true)
    private String memberKey;


    /** DM consent state (CM-072); isActive stays the soft-delete flag. Read through {@link #getState()}. */
    private RoomState state;

    /** Set when the room is soft-deleted (isActive = false). */

    private LocalDateTime deletedAt;

    public RoomSettings settings;

    /** A missing state (every room created before CM-072) reads as ACTIVE, so no backfill is needed. */
    public RoomState getState() {
        return state == null ? RoomState.ACTIVE : state;
    }

    public enum RoomType {
        PUBLIC, // anyone can join
        PRIVATE, // invite only
        DIRECT_MESSAGE, // 1-on-1 chat
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RoomSettings {
        private boolean allowFileSharing;
        private boolean allowGuestUsers;
        private boolean moderationRequired;
        private String welcomeMessage;
    }
}
