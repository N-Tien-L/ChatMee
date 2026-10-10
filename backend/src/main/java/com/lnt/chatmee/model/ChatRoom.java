package com.lnt.chatmee.model;

import java.time.LocalDateTime;

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
     * Only on active DIRECT_MESSAGE rooms: the two member ids, sorted and joined with ':'. The unique sparse
     * index allows one active DM per pair; soft delete unsets it so the pair can start a new DM later.
     */
    @Indexed(unique = true, sparse = true)
    private String memberKey;


    /** Set when the room is soft-deleted (isActive = false). */

    private LocalDateTime deletedAt;

    public RoomSettings settings;

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
