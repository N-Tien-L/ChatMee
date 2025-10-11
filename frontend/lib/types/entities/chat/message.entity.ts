import { MessageResponse } from "../../dto/chat.dto";

export interface Message extends MessageResponse {
    status?: 'sending' | 'sent' | 'failed';
    isOptimistic?: boolean;
    isOwn?: boolean;
    errorMessage?: string;
}