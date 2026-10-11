import { ApiResponse } from "@/lib/types";
import { MessagePageResponse } from "../types";
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
    }
}
