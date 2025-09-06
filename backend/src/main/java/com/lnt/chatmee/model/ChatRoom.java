package com.lnt.chatmee.model;

import java.time.LocalDateTime;
import java.util.Set;

import org.springframework.data.annotation.Id;
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

    private LocalDateTime createdAt;

    private LocalDateTime lastActivity;

    private RoomType type;

    private Set<String> participants;

    private Set<String> admins;

    private int maxParticipants; // -1 for unlimited

    private boolean isActive;

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
