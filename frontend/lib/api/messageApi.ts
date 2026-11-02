import { ApiResponse } from "@/lib/types";
import { MessageContextResponse, MessagePageResponse } from "../types";
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
}
