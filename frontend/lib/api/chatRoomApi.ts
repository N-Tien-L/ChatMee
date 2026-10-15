import { ApiResponse, ChatRoomResponse, MemberResponse, PagedResponse, PublicRoomSummary } from "@/lib/types";
import {
    CreateChatRoomRequest,
    UpdateChatRoomRequest,
    ParticipantRole
} from "@/lib/types";
import { apiClient } from "./apiClient";

// Chat room API endpoints
export const chatRoomApi = {

    // create chat room
    createChatRoom: async (request: CreateChatRoomRequest): Promise<ApiResponse<ChatRoomResponse>> => {
        try {
            const response = await apiClient.post<ApiResponse<ChatRoomResponse>>('/api/v1/rooms', request)
            return response.data;
        } catch (error) {
            console.error("Error creating chat room: ", error)
            throw error
        }
    },

    // get all chat rooms
    getChatRooms: async (): Promise<ApiResponse<ChatRoomResponse[]>> => {
        try {
            const response = await apiClient.get<ApiResponse<ChatRoomResponse[]>>('/api/v1/rooms')
            return response.data;
        } catch (error) {
            console.error("Error fetching chat rooms: ", error)
            throw error
        }
    },

    // discover public rooms the caller has not joined (paged)
    discoverRooms: async (query: string = '', page: number = 0, size: number = 20): Promise<ApiResponse<PagedResponse<PublicRoomSummary>>> => {
        try {
            const response = await apiClient.get<ApiResponse<PagedResponse<PublicRoomSummary>>>('/api/v1/rooms/discover', {
                params: { query, page, size }
            })
            return response.data;
        } catch (error) {
            console.error("Error discovering chat rooms")
            throw error
        }
    },

    // get chat room by ID
    getChatRoomById: async (roomId: string): Promise<ApiResponse<ChatRoomResponse>> => {
        try {
            const response = await apiClient.get<ApiResponse<ChatRoomResponse>>(`/api/v1/rooms/${roomId}`)
            return response.data;
        } catch (error) {
            console.error(`Error fetching chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // delete chat room by ID
    deleteChatRoom: async (roomId: string): Promise<ApiResponse<string>> => {
        try {
            const response = await apiClient.delete<ApiResponse<string>>(`/api/v1/rooms/${roomId}`)
            return response.data;
        } catch (error) {
            console.error(`Error deleting chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // update chat room by ID
    updateChatRoom: async (roomId: string, request: UpdateChatRoomRequest): Promise<ApiResponse<ChatRoomResponse>> => {
        try {
            const response = await apiClient.put<ApiResponse<ChatRoomResponse>>(`/api/v1/rooms/${roomId}`, request)
            return response.data;
        } catch (error) {
            console.error(`Error updating chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // join chat room by ID (204 No Content; a resolved promise means the caller joined)
    joinChatRoom: async (roomId: string): Promise<void> => {
        try {
            await apiClient.post(`/api/v1/rooms/${roomId}/members/me`)
        } catch (error) {
            console.error(`Error joining chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // leave chat room by ID
    leaveChatRoom: async (roomId: string): Promise<ApiResponse<string>> => {
        try {
            const response = await apiClient.delete<ApiResponse<string>>(`/api/v1/rooms/${roomId}/members/me`)
            return response.data;
        } catch (error) {
            console.error(`Error leaving chat room with ID ${roomId}: `, error)
            throw error
        }
    },

    // mark a room as read for the caller (204 No Content)
    markRoomRead: async (roomId: string): Promise<void> => {
        await apiClient.put(`/api/v1/rooms/${roomId}/members/me/read`)
    },

    // members of a room with their roles (the caller must be a member)
    getMembers: async (roomId: string): Promise<ApiResponse<MemberResponse[]>> => {
        const response = await apiClient.get<ApiResponse<MemberResponse[]>>(`/api/v1/rooms/${roomId}/members`)
        return response.data;
    },

    // remove a member (204; OWNER removes anyone but self, ADMIN removes MEMBERs; SPEC-008 AC-008-6)
    removeMember: async (roomId: string, userId: string): Promise<void> => {
        await apiClient.delete(`/api/v1/rooms/${roomId}/members/${userId}`)
    },

    // promote or demote a member between ADMIN and MEMBER (204; OWNER only, SPEC-009 AC-009-23)
    changeMemberRole: async (roomId: string, userId: string, role: ParticipantRole.ADMIN | ParticipantRole.MEMBER): Promise<void> => {
        await apiClient.patch(`/api/v1/rooms/${roomId}/members/${userId}/role`, { role })
    },

    // ids of the users that are online right now (a plain JSON array, not wrapped in ApiResponse)
    getOnlineUsers: async (): Promise<string[]> => {
        const response = await apiClient.get<string[]>('/api/v1/online-users')
        return response.data;
    }
}
