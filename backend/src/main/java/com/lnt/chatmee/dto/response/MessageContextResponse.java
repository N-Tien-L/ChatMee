package com.lnt.chatmee.dto.response;

import java.util.List;

/**
 * A window of history around one message, oldest first (SPEC-014 AC-014-6). {@code beforeCursor} is a history
 * {@code before} cursor for strictly older messages; {@code afterCursor} encodes the newest returned message the
 * same way. Each cursor is null when there is nothing further on that side.
 */
public record MessageContextResponse(List<ChatMessageResponse> messages, String targetId, boolean hasBefore,
        boolean hasAfter, String beforeCursor, String afterCursor) {
}
