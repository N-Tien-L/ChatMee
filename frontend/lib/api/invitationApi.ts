import { ApiResponse, InvitationResponse } from "@/lib/types";
import { apiClient } from "./apiClient";

// Invitations to PRIVATE rooms (SPEC-009 AC-009-1..3). Public rooms are joined through Discover.
export const invitationApi = {
    invite: async (roomId: string, userId: string): Promise<ApiResponse<InvitationResponse>> => {
        const response = await apiClient.post<ApiResponse<InvitationResponse>>(`/api/v1/rooms/${roomId}/invitations`, { userId });
        return response.data;
    },

    /** The room's pending invitations (OWNER/ADMIN only). */
    listForRoom: async (roomId: string): Promise<ApiResponse<InvitationResponse[]>> => {
        const response = await apiClient.get<ApiResponse<InvitationResponse[]>>(`/api/v1/rooms/${roomId}/invitations`);
        return response.data;
    },

    /** The caller's pending invitations. */
    listMine: async (): Promise<ApiResponse<InvitationResponse[]>> => {
        const response = await apiClient.get<ApiResponse<InvitationResponse[]>>("/api/v1/invitations");
        return response.data;
    },

    accept: async (id: string): Promise<void> => {
        await apiClient.post(`/api/v1/invitations/${id}/accept`);
    },

    decline: async (id: string): Promise<void> => {
        await apiClient.post(`/api/v1/invitations/${id}/decline`);
    },

    revoke: async (id: string): Promise<void> => {
        await apiClient.delete(`/api/v1/invitations/${id}`);
    },
};
