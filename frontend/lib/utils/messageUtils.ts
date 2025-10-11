// utils/messageUtils.ts
import { Message, MessageResponse } from "@/lib/types";

export const addIsOwnToMessages = (
    msgs: MessageResponse[],
    userId?: string
): Message[] =>
    msgs.map((msg) => ({
        ...msg,
        isOwn: userId === msg.senderId,
        status: "sent" as const,
    }));

export const deduplicateMessages = (messages: MessageResponse[]): MessageResponse[] =>
    messages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

export const updateSessionCache = (
    sessionCache: Map<string, any>,
    roomId: string,
    newMessages: Message[]
) => {
    const cached = sessionCache.get(roomId);
    if (!cached) return;
    const unique = deduplicateMessages([...cached.messages, ...newMessages]);
    sessionCache.set(roomId, { ...cached, messages: unique });
};
