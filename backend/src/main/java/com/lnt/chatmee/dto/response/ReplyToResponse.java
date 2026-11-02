package com.lnt.chatmee.dto.response;

import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Message.MessageType;

/**
 * The quote shown above a reply (SPEC-014 AC-014-3). {@code preview} is empty for non-text targets and null once
 * the target is deleted, so clients render "Original message unavailable" (AC-014-5).
 */
public record ReplyToResponse(String messageId, String senderId, String senderName, String preview,
        MessageType type) {

    public static ReplyToResponse from(Message.ReplySnapshot snapshot, boolean targetDeleted) {
        if (snapshot == null) {
            return null;
        }
        return new ReplyToResponse(snapshot.messageId(), snapshot.senderId(), snapshot.senderName(),
                targetDeleted ? null : snapshot.preview(), snapshot.type());
    }
}
