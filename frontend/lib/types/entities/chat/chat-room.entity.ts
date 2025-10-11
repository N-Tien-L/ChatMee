import { ChatRoomResponse } from "../../dto/chat.dto";

export interface RoomSettings {
    allowFileSharing: boolean;
    allowGuestUsers: boolean;
    moderationRequired: boolean;
    welcomeMessage: string;
}

export interface ChatRoom extends ChatRoomResponse {
    displayName?: string;
}