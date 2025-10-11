import { RoomSettings } from "../entities/chat/chat-room.entity";
import { MessageType, RoomType } from "../entities/chat/enums";

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
}

export interface MessageResponse {
    id: string;
    tempId: string;
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



