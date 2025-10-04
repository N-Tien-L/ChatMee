import { RoomSettings, RoomType } from "./CoreModelsAndEnum";

export interface CreateChatRoomRequest {
    roomType: RoomType;
    participantId?: string; // for direct messages
    roomName?: string; // for group chats
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

export interface UpdateUserRequest {
    name?: string
    email?: string
    profilePicURL?: string
}

export interface ChatMessageRequest {
    roomId: string;
    content: string;
    messageType: 'TEXT' | 'SYSTEM' | 'JOIN' | 'LEAVE' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'FILE';
    tempId?: string; // For matching optimistic updates
}
