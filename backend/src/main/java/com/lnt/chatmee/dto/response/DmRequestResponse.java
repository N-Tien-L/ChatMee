package com.lnt.chatmee.dto.response;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.MembershipRequest;

/**
 * A pending DM request as listed by {@code GET /dm-requests} and sent in {@code DM_REQUEST_RECEIVED} (AC-009-11).
 * {@code preview} is the summary of the one message the sender may send, or null before it is sent.
 */
public record DmRequestResponse(
    String roomId,
    UserSummaryResponse sender,
    String preview,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant expiresAt
) {
    public static DmRequestResponse from(MembershipRequest request, UserSummaryResponse sender, ChatRoom room) {
        String preview = room == null || room.getLastMessage() == null ? null : room.getLastMessage().preview();
        return new DmRequestResponse(request.getRoomId(), sender, preview, request.getCreatedAt(),
            request.getExpiresAt());
    }
}
