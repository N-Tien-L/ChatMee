import { ApiResponse } from "../type/ResponseType";
import { MessageResponse } from "../types";
import { apiClient } from "./apiClient";

export const messageApi = {
    get50RecentMessages: async (roomId: string): Promise<ApiResponse<MessageResponse[]>> => {
        const response = await apiClient.get<ApiResponse<MessageResponse[]>>(`/api/v1/messages/room/${roomId}`);
        return response.data;
    }
}