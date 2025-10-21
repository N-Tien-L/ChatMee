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

    // login with popup (better for cross-origin cookies)
    login: (provider = 'google') => {
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const url = `${API_BASE_URL}/oauth2/authorization/${provider}?prompt=select_account`;

        const popup = window.open(
            url,
            'OAuth Login',
            `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
        );

        // Listen for message from popup
        const messageHandler = (event: MessageEvent) => {
            if (event.origin !== API_BASE_URL) return;

            if (event.data.type === 'oauth-success') {
                console.log('OAuth success! Session ID:', event.data.sessionId);
                window.removeEventListener('message', messageHandler);
                // Redirect to dashboard
                window.location.href = '/dashboard';
            }
        };

        window.addEventListener('message', messageHandler);

        // Fallback: Poll for popup close
        const checkPopup = setInterval(() => {
            if (!popup || popup.closed) {
                clearInterval(checkPopup);
                window.removeEventListener('message', messageHandler);
            }
        }, 500);
    },

    // logout
    logout: async () => {
        try {
            // Logout from application
            window.location.href = `${API_BASE_URL}/logout`
        } catch (error) {
            console.error("Error during logout: ", error)
            throw error
        }
    },

    // Force logout from Google and then login again
    loginWithAccountSelection: (provider = 'google') => {
        // First logout from Google, then redirect to login
        window.location.href = `https://accounts.google.com/logout?continue=${encodeURIComponent(`${API_BASE_URL}/oauth2/authorization/${provider}?prompt=select_account`)}`
    }
}