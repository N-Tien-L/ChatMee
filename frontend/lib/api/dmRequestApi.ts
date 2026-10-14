import { ApiResponse, DmRequestResponse } from "@/lib/types";
import { apiClient } from "./apiClient";

// Direct-message requests waiting for the caller (SPEC-009).
export const dmRequestApi = {
    listMine: async (): Promise<ApiResponse<DmRequestResponse[]>> => {
        const response = await apiClient.get<ApiResponse<DmRequestResponse[]>>("/api/v1/dm-requests");
        return response.data;
    },

    accept: async (roomId: string): Promise<void> => {
        await apiClient.post(`/api/v1/rooms/${roomId}/dm-request/accept`);
    },

    decline: async (roomId: string): Promise<void> => {
        await apiClient.post(`/api/v1/rooms/${roomId}/dm-request/decline`);
    },
};
