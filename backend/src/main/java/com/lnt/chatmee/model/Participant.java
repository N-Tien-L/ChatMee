package com.lnt.chatmee.model;

import java.time.LocalDateTime;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "participants")
@CompoundIndex(name = "room_user_index", def = "{'chatRoomId': 1, 'userId': 1}", unique = true)
public class Participant {
    
    @Id
    private String id;

    private String chatRoomId;

    private String userId;

    private Role role;

    private LocalDateTime joinedAt;

    private LocalDateTime lastSeenAt; // this field will be used in displaying user's status in the room

    private boolean isMuted;

    private boolean isBlocked;

    private String nickName;

    private LocalDateTime updatedAt;
    
    @PrePersist
    public void prePersist() {
        this.joinedAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }   

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public enum Role {
        OWNER,
        ADMIN,
        MEMBER,
    }
}
