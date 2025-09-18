import { RoomSettings, RoomType } from "./ChatTypes"

export interface UserResponse {
    id: string
    name: string
    email: string
    avatarUrl: string
    provider: string
}

export interface AuthResponse {
    authenticated: string
    user?: UserResponse
    message: string
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
}

export interface ParticipantResponse {
    id: string
    userId: string
    roomId: string
    joinedAt: string
    role: string
    isMuted: boolean
    isBlocked: boolean
    nickName?: string
}

export interface ChatRoomListItem extends ChatRoomResponse {
    participantCount?: number;
    lastActivity?: string;
    hasUnreadMessages?: boolean;
    lastMessage?: {
        content: string;
        senderName: string;
        timestamp: string;
    };
}

export interface ApiResponse<T> {
    success: boolean
    message?: string
    data: T;
}