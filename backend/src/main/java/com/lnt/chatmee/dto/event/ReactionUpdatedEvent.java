package com.lnt.chatmee.dto.event;

import java.util.List;

/**
 * Room-topic frame after a reaction change (SPEC-015 AC-015-7). Counts only: {@code reactedByMe} differs per
 * client. Message frames have no {@code event} field, which is how clients tell the two apart.
 */
public record ReactionUpdatedEvent(String event, String messageId, List<Count> summary) {

    public static final String TYPE = "REACTION_UPDATED";

    public ReactionUpdatedEvent(String messageId, List<Count> summary) {
        this(TYPE, messageId, summary);
    }

    public record Count(String emoji, long count) {
    }
}
