import { ApiResponse } from "@/lib/types";
import { MessageResponse } from "../types";
import { apiClient } from "./apiClient";

export const messageApi = {
    get50RecentMessages: async (roomId: string): Promise<ApiResponse<MessageResponse[]>> => {
        const response = await apiClient.get<ApiResponse<MessageResponse[]>>(`/api/v1/rooms/${roomId}/messages`);
        return response.data;
    }
}