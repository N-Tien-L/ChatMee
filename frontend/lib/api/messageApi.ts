import { ApiResponse, ChatMessageResponse } from "../type/ResponseType";
import { apiClient } from "./apiClient";

export const messageApi = {
    get50RecentMessages: async (roomId: string): Promise<ApiResponse<ChatMessageResponse[]>> => {
        const response = await apiClient.get<ApiResponse<ChatMessageResponse[]>>(`/api/v1/messages/room/${roomId}`);
        return response.data;
    }
}