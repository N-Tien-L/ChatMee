import { RoomSettings, RoomType } from "./CoreModelsAndEnum"

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
    participants?: string[]; // Add participants array
    displayName?: string; // Add computed display name
}

export interface ChatMessageResponse {
    id: string;
    tempId?: string; // For matching optimistic messages
    chatRoomId: string;
    senderId: string;
    senderName: string;
    content: string;
    type: 'TEXT' | 'SYSTEM' | 'JOIN' | 'LEAVE' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'FILE';
    createdAt: string;
    updatedAt: string;
    isUpdated: boolean;
    isDeleted: boolean;
    isOwn?: boolean;
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