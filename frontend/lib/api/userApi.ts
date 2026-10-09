import { ApiResponse, UserSummaryResponse, PagedResponse } from "../type/ResponseType";
import { apiClient } from "./apiClient";

export const userApi = {

    searchUsers: async (query: string = '', page: number = 0, size: number = 20): Promise<ApiResponse<PagedResponse<UserSummaryResponse>>> => {
        try {
            const response = await apiClient.get<ApiResponse<PagedResponse<UserSummaryResponse>>>(`/api/v1/users`, {
                params: { query, page, size }
            });
            return response.data
        } catch (error) {
            console.error("Error searching users")
            throw error
        }
    },

    getUserById: async (userId: string): Promise<ApiResponse<UserSummaryResponse>> => {
        try {
            const response = await apiClient.get<ApiResponse<UserSummaryResponse>>(`/api/v1/users/${userId}`)
            return response.data
        } catch (error) {
            console.error("Error getting user by id")
            throw error
        }
    }
}