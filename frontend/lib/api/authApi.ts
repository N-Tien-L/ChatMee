import { ApiResponse, AuthResponse, UserResponse } from "@/lib/types";
import { apiClient } from "./apiClient";

// Auth API endpoints
export const authApi = {
    getWsToken: async (): Promise<string> => {
        const response = await apiClient.post<{ token: string }>('/api/v1/auth/ws-token');
        if (typeof response.data.token !== 'string' || !response.data.token) {
            throw new Error('Invalid WebSocket token response');
        }
        return response.data.token;
    },

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

    // login with OAuth2 - using same domain via Vercel proxy
    login: (provider = 'google') => {
        // Direct redirect - no popup needed since we're on same domain now
        window.location.href = `/oauth2/authorization/${provider}?prompt=select_account`;
    },

    // logout
    logout: async () => {
        try {
            // Logout from application
            await apiClient.post("/logout")
            window.location.href = "/login"
        } catch (error) {
            console.error("Error during logout: ", error)
            throw error
        }
    },

    // Force logout from Google and then login again
    loginWithAccountSelection: (provider = 'google') => {
        // First logout from Google, then redirect to login
        const currentDomain = window.location.origin;
        window.location.href = `https://accounts.google.com/logout?continue=${encodeURIComponent(`${currentDomain}/oauth2/authorization/${provider}?prompt=select_account`)}`
    }
}