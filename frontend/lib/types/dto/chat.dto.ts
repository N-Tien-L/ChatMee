import { RoomSettings } from "../entities/chat/chat-room.entity";
import { MessageType, RoomType } from "../entities/chat/enums";
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
}

export interface MessageResponse {
    id: string;
    tempId?: string;
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



