package com.lnt.chatmee.model;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One user's reaction to one message (SPEC-015 AC-015-2): at most one per (messageId, userId). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "reactions")
@CompoundIndex(name = "reactions_message_user", def = "{'messageId': 1, 'userId': 1}", unique = true)
// Who-reacted pages, newest first (AC-015-6).
@CompoundIndex(name = "reactions_message_created_id", def = "{'messageId': 1, 'createdAt': -1, '_id': -1}")
public class Reaction {

    @Id
    private String id;

    private String messageId;

    /** Removes a deleted room's reactions in one query (AC-015-11). */
    @Indexed(name = "reactions_room")
    private String roomId;

    private String userId;

    private String emoji;

    /** When this emoji was chosen; a change of emoji sets it again. */
    private Instant createdAt;
}
