import { ApiResponse, BlockedUserResponse, UserSummaryResponse, PagedResponse } from "@/lib/types";
import { apiClient } from "./apiClient";

export const userApi = {

    searchUsers: async (query: string = '', page: number = 0, size: number = 20): Promise<ApiResponse<PagedResponse<UserSummaryResponse>>> => {
        const response = await apiClient.get<ApiResponse<PagedResponse<UserSummaryResponse>>>(`/api/v1/users`, {
            params: { query, page, size }
        });
        return response.data
    },

    getUserById: async (userId: string): Promise<ApiResponse<UserSummaryResponse>> => {
        const response = await apiClient.get<ApiResponse<UserSummaryResponse>>(`/api/v1/users/${userId}`)
        return response.data
    },

    /** The caller's blocks, newest first (AC-009-15). */
    listBlocks: async (): Promise<ApiResponse<BlockedUserResponse[]>> => {
        const response = await apiClient.get<ApiResponse<BlockedUserResponse[]>>('/api/v1/users/me/blocks')
        return response.data
    },

    /** Idempotent, 204 (AC-009-15). */
    blockUser: async (userId: string): Promise<void> => {
        await apiClient.put(`/api/v1/users/${userId}/block`)
    },

    /** Idempotent, 204 (AC-009-15). */
    unblockUser: async (userId: string): Promise<void> => {
        await apiClient.delete(`/api/v1/users/${userId}/block`)
    }
}
