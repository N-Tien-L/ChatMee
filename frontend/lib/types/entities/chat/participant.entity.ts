import { ParticipantRole } from "./enums";

export interface Participant {
    id: string;
    chatRoomId: string;
    userId: string;
    role: ParticipantRole;
    joinedAt: string;
    lastSeenAt: string;
    isMuted: boolean;
    isBlocked: boolean;
    nickName?: string;
    updatedAt: string;
}