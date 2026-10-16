import { ApiResponse, AuthResponse } from "@/lib/types";
import { apiClient } from "./apiClient";

/** Only Google honours prompt=select_account; GitHub rejects or ignores it. */
export function oauthLoginUrl(provider: string): string {
    const base = `/oauth2/authorization/${provider}`;
    return provider === 'google' ? `${base}?prompt=select_account` : base;
}

// Auth API endpoints
export const authApi = {
    getWsToken: async (): Promise<string> => {
        const response = await apiClient.post<{ token: string }>('/api/v1/auth/ws-token');
        if (typeof response.data.token !== 'string' || !response.data.token) {
            throw new Error('Invalid WebSocket token response');
        }
        return response.data.token;
    },

    // get current authenticated user; a 401 rejects and means "no session"
    getCurrentUser: async (): Promise<ApiResponse<AuthResponse>> => {
        const response = await apiClient.get<ApiResponse<AuthResponse>>('/api/v1/auth/me')
        return response.data
    },

    // login with OAuth2 - using same domain via Vercel proxy
    login: (provider = 'google') => {
        window.location.href = oauthLoginUrl(provider);
    },

    // Ends the server session; rejects when the server did not agree (CSRF 403, network error).
    logout: async (): Promise<void> => {
        await apiClient.post("/logout")
    },

    // Full navigation so every in-memory module cache is dropped; the flag lets /login confirm it.
    redirectToLogin: () => {
        window.location.assign('/login?signedOut=true');
    },
}
