import { ChatRoomResponse } from "../dto/chat.dto";

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