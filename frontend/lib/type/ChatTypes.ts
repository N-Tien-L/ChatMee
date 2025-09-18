// Chat Room Types
export enum RoomType {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  DIRECT_MESSAGE = 'DIRECT_MESSAGE'
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  VOICE = 'VOICE',
  FILE = 'FILE',
  SYSTEM = 'SYSTEM'
}

export enum ParticipantRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER'
}

// Core Models
export interface RoomSettings {
  allowFileSharing: boolean;
  allowGuestUsers: boolean;
  moderationRequired: boolean;
  welcomeMessage: string;
}

export interface ChatRoom {
  id: string;
  roomName: string;
  description?: string;
  roomType: RoomType;
  createdBy: string;
  createdAt: string; // ISO date string
  maxUsers: number;
  settings: RoomSettings;
}

export interface Message {
  id: string;
  chatRoomId: string;
  senderId: string;
  type: MessageType;
  content: string;
  attachments?: string[];
  createdAt: string;
  updatedAt: string;
  isUpdated: boolean;
  isDeleted: boolean;
}

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

// Request DTOs
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

// Response DTOs

// Extended types for UI
export interface ChatRoomWithParticipants extends ChatRoom {
  participants: Participant[];
  messages?: Message[];
}

export interface SendMessageRequest {
  type: MessageType;
  content: string;
  attachments?: string[];
}