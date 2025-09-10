import { ApiResponse, UserResponse } from "../type/ResponseType";
import { apiClient } from "./apiClient";

// User API endpoints
export const userApi = {

    // Get all users
    getAllUsers: async (): Promise<ApiResponse<UserResponse[]>> => {
        try {
            const response = await apiClient.get<ApiResponse<UserResponse[]>>("/api/v1/users")
            return response.data
        } catch (error) {
            console.error("Error getting all users")
            throw error
        }
    },

    // Get user by Id
    getUserById: async (userId: string): Promise<ApiResponse<UserResponse>> => {
        try {
            const response = await apiClient.get<ApiResponse<UserResponse>>(`/api/v1/users/${userId}`)
            return response.data
        } catch (error) {
            console.error("Error getting user by id")
            throw error
        }
    },

    getUserByProviderAndId: async (provider: string, providerId: string): Promise<ApiResponse<UserResponse>> => {
        try {
            const response = await apiClient.get<ApiResponse<UserResponse>>(`/api/v1/users/${provider}/id/${providerId}`)
            return response.data
        } catch (error) {
            console.error("Error getting user by provider and providerId")
            throw error
        }
    }
}