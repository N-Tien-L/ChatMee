import { MessageResponse } from "../../dto/chat.dto";

export interface Message extends MessageResponse {
    status?: 'sending' | 'sent' | 'failed';
    isOptimistic?: boolean;
    isOwn?: boolean;
    errorMessage?: string;
    /** Server error code (e.g. RATE_LIMITED), or TIMEOUT / NOT_SENT for client-side failures. */
    errorCode?: string;
}