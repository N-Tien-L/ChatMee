package com.lnt.chatmee.model;

import java.time.LocalDateTime;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
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
@Document(collection = "participants")
@CompoundIndex(name = "room_user_index", def = "{'chatRoomId': 1, 'userId': 1}", unique = true)
public class Participant {
    
    @Id
    private String id;

    private String chatRoomId;

    @Indexed

    private String userId;

    private Role role;

    @CreatedDate

    private LocalDateTime joinedAt;

    private LocalDateTime lastSeenAt; // this field will be used in displaying user's status in the room

    private boolean isMuted;

    private boolean isBlocked;

    private String nickName;

    @LastModifiedDate

    private LocalDateTime updatedAt;

    public enum Role {
        OWNER,
        ADMIN,
        MEMBER,
    }
}
