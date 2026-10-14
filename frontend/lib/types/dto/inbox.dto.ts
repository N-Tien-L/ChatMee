import { UserSummaryResponse } from "./user.dto";

/** A pending invitation (GET /api/v1/invitations, INVITATION_RECEIVED; SPEC-009 AC-009-3). */
export interface InvitationResponse {
    id: string;
    room: { id: string; name: string; memberCount: number };
    inviter: UserSummaryResponse;
    invitee: UserSummaryResponse;
    createdAt: string;
    expiresAt: string;
}

/** A pending DM request (GET /api/v1/dm-requests, DM_REQUEST_RECEIVED). `preview` is null until the one allowed message. */
export interface DmRequestResponse {
    roomId: string;
    sender: UserSummaryResponse;
    preview: string | null;
    createdAt: string;
    expiresAt: string;
}
