package com.lnt.chatmee.dto.response;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.MembershipRequest;

/**
 * A pending invitation as listed by {@code GET /invitations} and sent in {@code INVITATION_RECEIVED} (AC-009-3).
 * {@code invitee} lets OWNER/ADMIN tell the room's invitations apart.
 */
public record InvitationResponse(
    String id,
    RoomSummary room,
    UserSummaryResponse inviter,
    UserSummaryResponse invitee,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant expiresAt
) {
    public record RoomSummary(String id, String name, int memberCount) {
        public static RoomSummary from(ChatRoom room) {
            return new RoomSummary(room.getId(), room.getName(), room.getMemberCount());
        }
    }

    public static InvitationResponse from(MembershipRequest invitation, ChatRoom room,
            UserSummaryResponse inviter, UserSummaryResponse invitee) {
        return new InvitationResponse(invitation.getId(), RoomSummary.from(room), inviter, invitee,
            invitation.getCreatedAt(), invitation.getExpiresAt());
    }
}
