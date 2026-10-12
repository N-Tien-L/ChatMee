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
// A retried or resent send with the same client id stores one row (SPEC-008 AC-008-13).
@CompoundIndex(name = "messages_room_sender_client", def = "{'chatRoomId': 1, 'senderId': 1, 'clientMessageId': 1}",
        unique = true, partialFilter = "{'clientMessageId': {'$exists': true}}")
public class Message {

    @Id
    private String id;

    private String chatRoomId;

    private String senderId;

    /** The client's tempId; unique per (chatRoomId, senderId) when present. */
    private String clientMessageId;

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
