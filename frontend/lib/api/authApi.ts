const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

import { ApiResponse, AuthResponse, UserResponse } from "../type/ResponseType";
import { apiClient } from "./apiClient";

// Auth API endpoints
export const authApi = {

    // get current authenticated user
    getCurrentUser: async (): Promise<ApiResponse<AuthResponse>> => {
        try {
            const response = await apiClient.get<ApiResponse<AuthResponse>>('/api/v1/auth/me')
            return response.data
        } catch (error) {
            console.error("Error getting current user: ", error)
            throw error
        }
    },

    // check authentication status
    getAuthStatus: async (): Promise<ApiResponse<boolean>> => {
        try {
            const response = await apiClient.get<ApiResponse<boolean>>('/api/v1/auth/status')
            return response.data
        } catch (error) {
            console.error("Error checking auth status: ", error)
            throw error
        }
    },

    // get user information
    getUserInfo: async (): Promise<ApiResponse<UserResponse>> => {
        try {
            const response = await apiClient.get<ApiResponse<UserResponse>>('/api/v1/auth/user')
            return response.data
        } catch (error) {
            console.error("Error getting user info: ", error)
            throw error
        }
    },

    // login
    // Fallback to 'google' if no provider is passed
    login: (provider = 'google') => {
        window.location.href = `${API_BASE_URL}/oauth2/authorization/${provider}`
    },

    // logout
    logout: async () => {
        try {
            window.location.href = `${API_BASE_URL}/logout`
        } catch (error) {
            console.error("Error during logout: ", error)
            throw error
        }
    }
}