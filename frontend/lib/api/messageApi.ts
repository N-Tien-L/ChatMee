import { ApiResponse } from "@/lib/types";
import { MessageContextResponse, MessagePageResponse, MessageReactionsResponse, ReactorPageResponse } from "../types";
import { apiClient } from "./apiClient";

export interface GetMessagesParams {
    /** Cursor from a previous page's nextCursor; absent loads the newest page. */
    before?: string;
    limit?: number;
}

export const messageApi = {
    getMessages: async (roomId: string, params: GetMessagesParams = {}): Promise<ApiResponse<MessagePageResponse>> => {
        const response = await apiClient.get<ApiResponse<MessagePageResponse>>(`/api/v1/rooms/${roomId}/messages`, {
            params: { before: params.before, limit: params.limit },
        });
        return response.data;
    },

    /** The target and up to `limit` messages on each side, for jumping to a reply's original (SPEC-014 AC-014-6). */
    getContext: async (roomId: string, messageId: string, limit = 20): Promise<ApiResponse<MessageContextResponse>> => {
        const response = await apiClient.get<ApiResponse<MessageContextResponse>>(
            `/api/v1/rooms/${roomId}/messages/${encodeURIComponent(messageId)}/context`,
            { params: { limit } },
        );
        return response.data;
    },

    /** Sets the caller's one reaction, replacing any previous one (SPEC-015 AC-015-1). */
    react: async (roomId: string, messageId: string, emoji: string): Promise<ApiResponse<MessageReactionsResponse>> => {
        const response = await apiClient.put<ApiResponse<MessageReactionsResponse>>(
            `/api/v1/rooms/${roomId}/messages/${encodeURIComponent(messageId)}/reaction`,
            { emoji },
        );
        return response.data;
    },

    /** Removes the caller's reaction; idempotent. */
    unreact: async (roomId: string, messageId: string): Promise<ApiResponse<MessageReactionsResponse>> => {
        const response = await apiClient.delete<ApiResponse<MessageReactionsResponse>>(
            `/api/v1/rooms/${roomId}/messages/${encodeURIComponent(messageId)}/reaction`,
        );
        return response.data;
    },

    /** Who reacted, newest first, optionally for one emoji (AC-015-6). */
    getReactors: async (
        roomId: string,
        messageId: string,
        params: { emoji?: string; cursor?: string; limit?: number } = {},
    ): Promise<ApiResponse<ReactorPageResponse>> => {
        const response = await apiClient.get<ApiResponse<ReactorPageResponse>>(
            `/api/v1/rooms/${roomId}/messages/${encodeURIComponent(messageId)}/reactions`,
            { params: { emoji: params.emoji, cursor: params.cursor, limit: params.limit } },
        );
        return response.data;
    },
}
