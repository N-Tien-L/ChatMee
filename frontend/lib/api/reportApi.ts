import { CreateReportRequest } from "@/lib/types";
import { apiClient } from "./apiClient";

// Reports of users, messages and rooms (SPEC-009 AC-009-20). The server answers 202 with no body and no status.
export const reportApi = {
    create: async (request: CreateReportRequest): Promise<void> => {
        await apiClient.post("/api/v1/reports", request);
    },
};
