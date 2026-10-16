// Responses (backend dto/response records)

export interface UserResponse {
    id: string
    name: string
    email: string
    avatarUrl: string
    provider: string
}

/** Another user's public profile: never carries an email (CM-047). */
export interface UserSummaryResponse {
    id: string;
    name: string;
    avatarUrl: string;
}

export interface AuthResponse {
    authenticated: boolean
    user?: UserResponse
    message: string
}

/** One of the caller's blocks (GET /api/v1/users/me/blocks, SPEC-009 AC-009-15). */
export interface BlockedUserResponse {
    id: string;
    name: string;
    avatarUrl?: string | null;
    blockedAt: string;
}

export type ReportTargetType = "USER" | "MESSAGE" | "ROOM";
export type ReportReason = "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER";

/** Body of POST /api/v1/reports (SPEC-009 AC-009-20); `note` is at most 500 characters. */
export interface CreateReportRequest {
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    note?: string;
}
