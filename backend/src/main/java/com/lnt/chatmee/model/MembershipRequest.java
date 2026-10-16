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

/** Invitation or DM request waiting for its target user's answer (SPEC-009, ADR-0006). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "membership_requests")
// One PENDING request per room and person; decided rows no longer count.
@CompoundIndex(name = "membership_requests_room_target_pending", def = "{'roomId': 1, 'targetUserId': 1}",
        unique = true, partialFilter = "{'status': 'PENDING'}")
@CompoundIndex(name = "membership_requests_target_kind_status", def = "{'targetUserId': 1, 'kind': 1, 'status': 1}")
@CompoundIndex(name = "membership_requests_room_status", def = "{'roomId': 1, 'status': 1}")
@CompoundIndex(name = "membership_requests_pair_cooldown", def = "{'pairKey': 1, 'cooldownUntil': 1}")
public class MembershipRequest {

    @Id
    private String id;

    private MembershipRequestKind kind;

    private String roomId;

    private String inviterId; // inviter, or DM sender

    private String targetUserId; // invitee, or DM recipient

    private MembershipRequestStatus status;

    private String pairKey; // DM_REQUEST only (CM-072)

    private Instant createdAt;

    private Instant expiresAt;

    private Instant decidedAt;

    private Instant cooldownUntil; // declined DM_REQUEST only (CM-072)
}
