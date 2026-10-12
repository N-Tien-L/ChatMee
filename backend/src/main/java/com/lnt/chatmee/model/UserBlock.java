package com.lnt.chatmee.model;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One user blocking another (SPEC-009 AC-009-15..19). "Blocked either way" is one $or query on both indexes. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "user_blocks")
@CompoundIndex(name = "user_blocks_blocker_blocked_unique", def = "{'blockerId': 1, 'blockedId': 1}", unique = true)
@CompoundIndex(name = "user_blocks_blocked_blocker", def = "{'blockedId': 1, 'blockerId': 1}")
public class UserBlock {

    @Id
    private String id;

    private String blockerId;

    private String blockedId;

    private Instant createdAt;
}
