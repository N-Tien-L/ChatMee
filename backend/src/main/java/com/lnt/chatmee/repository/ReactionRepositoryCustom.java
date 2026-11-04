package com.lnt.chatmee.repository;

import java.time.Instant;
import java.util.List;

import com.lnt.chatmee.model.Reaction;

public interface ReactionRepositoryCustom {

    /**
     * Sets the user's one reaction on a message, replacing another emoji (AC-015-1). A repeat of the same emoji
     * changes nothing; concurrent first reactions leave one row (unique index plus one retry as an update).
     */
    void setReaction(String messageId, String roomId, String userId, String emoji, Instant now);

    /** Newest first, strictly before the optional (createdAt, id) boundary; {@code emoji} null means all. */
    List<Reaction> findPage(String messageId, String emoji, Instant beforeCreatedAt, String beforeId, int limit);
}
