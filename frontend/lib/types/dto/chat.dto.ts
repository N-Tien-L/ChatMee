import { RoomSettings } from "../entities/chat/chat-room.entity";
import { MessageType, ParticipantRole, RoomType } from "../entities/chat/enums";
import { UserSummaryResponse } from "./user.dto";

// Requests

export interface CreateChatRoomRequest {
    roomType: RoomType;
    participantId?: string; // for direct messages
    roomName?: string;      // for group chats
    description?: string;
    maxUsers?: number;
    settings?: Partial<RoomSettings>;
}

export interface UpdateChatRoomRequest {
    roomName?: string;
    description?: string;
    maxUsers?: number;
    settings?: Partial<RoomSettings>;
}

export interface JoinChatRoomRequest {
    userId: string;
    role?: string;
}

export interface ChatMessageRequest {
    roomId: string;
    content: string;
    messageType: MessageType;
    tempId?: string; // For matching optimistic updates
}

// Response

/** Preview of the newest non-SYSTEM message of a room (`lastMessage` of a room, `ROOM_ACTIVITY`). */
export interface LastMessageSummary {
    id: string;
    senderId: string;
    senderName?: string;
    preview: string;
    createdAt: string;
}

export interface ChatRoomResponse {
    id: string;
    roomName: string;
    description?: string;
    roomType: RoomType;
    createdBy: string;
    createdAt: string;
    maxUsers: number;
    settings: RoomSettings;
    participants?: string[];
    /** DIRECT_MESSAGE rooms: the other member as seen by the caller (CM-049). */
    counterpart?: UserSummaryResponse | null;
    updatedAt?: string;
    /** ISO-8601 UTC time of the newest activity; the list is sorted by it. */
    lastActivityAt?: string | null;
    lastMessage?: LastMessageSummary | null;
    unreadCount?: number;
    myRole?: ParticipantRole | null;
    /** Absent until CM-072; a missing value means ACTIVE. REQUESTED = a DM request not yet accepted. */
    state?: "ACTIVE" | "REQUESTED";
}

/** One row of GET /api/v1/rooms/{roomId}/members (CM-062): members only, with their role. */
export interface MemberResponse {
    id: string;
    name: string;
    avatarUrl?: string | null;
    role: ParticipantRole;
}

/** Envelope of every frame on `/user/queue/events`. */
export interface UserEventEnvelope {
    type: string;
    payload: unknown;
    occurredAt: string;
}

export interface MessageResponse {
    id: string;
    tempId?: string;
    /** The sender's client id as stored by the server; history carries it so a resync can match a pending copy. */
    clientMessageId?: string;
    chatRoomId: string;
    senderId: string;
    senderName?: string;
    type: MessageType;
    content: string;
    attachments?: string[];
    createdAt: string;
    updatedAt: string;
    isUpdated: boolean;
    isDeleted: boolean;
}

/** One page of GET /api/v1/rooms/{roomId}/messages (CM-044), oldest message first. */
export interface MessagePageResponse {
    messages: MessageResponse[];
    /** Opaque cursor of the oldest message of this page; pass it as `before`. Null when there is nothing older. */
    nextCursor: string | null;
    hasMore: boolean;
}

/** Public metadata of a joinable room from GET /api/v1/rooms/discover (no participants). */
export interface PublicRoomSummary {
    id: string;
    name: string;
    description?: string;
    memberCount: number;
    /** <= 0 means unlimited. */
    maxMembers: number;
    createdAt?: string;
}
