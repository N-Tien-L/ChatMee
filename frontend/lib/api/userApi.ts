import { ApiResponse, UserSummaryResponse, PagedResponse } from "@/lib/types";
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
    }
}
