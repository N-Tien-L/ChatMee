import { ApiResponse, ChatRoomResponse } from "../type/ResponseType";
import {
    CreateChatRoomRequest,
    UpdateChatRoomRequest,
    JoinChatRoomRequest
} from "../type/ChatTypes";
import { apiClient } from "./apiClient";

// Chat room API endpoints
export const chatRoomApi = {

    // create chat room
    createChatRoom: async (request: CreateChatRoomRequest): Promise<ApiResponse<ChatRoomResponse>> => {
        try {
            const response = await apiClient.post<ApiResponse<ChatRoomResponse>>('/api/v1/chatrooms/create', request)
            return response.data;
        } catch (error) {
            console.error("Error creating chat room: ", error)
            throw error
        }
    },

    // get all chat rooms
    getChatRooms: async (): Promise<ApiResponse<ChatRoomResponse[]>> => {
        try {
            const response = await apiClient.get<ApiResponse<ChatRoomResponse[]>>('/api/v1/chatrooms')
            return response.data;
        } catch (error) {
            console.error("Error fetching chat rooms: ", error)
            throw error
        }
    },

    // get chat room by ID
    getChatRoomById: async (roomId: string): Promise<ApiResponse<ChatRoomResponse>> => {
        try {
            const response = await apiClient.get<ApiResponse<ChatRoomResponse>>(`/api/v1/chatrooms/${roomId}`)
            return response.data;
        } catch (error) {
            console.error(`Error fetching chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // delete chat room by ID
    deleteChatRoom: async (roomId: string): Promise<ApiResponse<string>> => {
        try {
            const response = await apiClient.delete<ApiResponse<string>>(`/api/v1/chatrooms/${roomId}`)
            return response.data;
        } catch (error) {
            console.error(`Error deleting chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // update chat room by ID
    updateChatRoom: async (roomId: string, request: UpdateChatRoomRequest): Promise<ApiResponse<ChatRoomResponse>> => {
        try {
            const response = await apiClient.put<ApiResponse<ChatRoomResponse>>(`/api/v1/chatrooms/${roomId}`, request)
            return response.data;
        } catch (error) {
            console.error(`Error updating chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // join chat room by ID
    joinChatRoom: async (roomId: string): Promise<ApiResponse<string>> => {
        try {
            const response = await apiClient.post<ApiResponse<string>>(`/api/v1/chatrooms/${roomId}/join`)
            return response.data;
        } catch (error) {
            console.error(`Error joining chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // add participant to chat room (admin/owner only)
    addParticipant: async (roomId: string, request: JoinChatRoomRequest): Promise<ApiResponse<string>> => {
        try {
            const response = await apiClient.post<ApiResponse<string>>(`/api/v1/chatrooms/${roomId}/add-participant`, request)
            return response.data;
        } catch (error) {
            console.error(`Error adding participant to chat room with ID ${roomId}: `, error)
            throw error
        }
    }
}