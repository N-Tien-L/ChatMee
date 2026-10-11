package com.lnt.chatmee.model;

import java.time.Instant;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
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
@Document(collection = "messages")
@CompoundIndex(name = "messages_room_created_id", def = "{'chatRoomId': 1, 'createdAt': -1, '_id': -1}")
public class Message {
    
    @Id
    private String id;

    private String chatRoomId;

    private String senderId;

    private MessageType type;

    private String content; // text content or media url

    private List<String> attachments; // list of attachment urls

    private Instant createdAt;

    private Instant updatedAt;

    private boolean isUpdated;

    private boolean isDeleted;

    public enum MessageType {
        TEXT,
        IMAGE,
        VIDEO,
        VOICE,
        FILE,
        SYSTEM,
    }
}
