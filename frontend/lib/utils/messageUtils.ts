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

export const deduplicateMessages = <T extends { id: string }>(messages: T[]): T[] =>
    messages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

type SessionCacheEntry = {
    messages: Array<{ id: string }>;
    [key: string]: unknown;
};

export const updateSessionCache = (
    sessionCache: Map<string, SessionCacheEntry>,
    roomId: string,
    newMessages: Array<{ id: string }>
) => {
    const cached = sessionCache.get(roomId);
    if (!cached) return;
    const unique = deduplicateMessages([
        ...cached.messages,
        ...newMessages,
    ]);
    sessionCache.set(roomId, { ...cached, messages: unique });
};
