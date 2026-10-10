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

const timeOf = (createdAt: string) => {
    const time = Date.parse(createdAt);
    return Number.isNaN(time) ? 0 : time;
};

/**
 * Merges a freshly fetched history page into the messages on screen (resync after reconnect).
 * Server copies win by id, confirmed messages outside the page are kept, the result is ordered by
 * createdAt, and pending/failed optimistic messages stay at the end unchanged.
 */
export const mergeResyncedMessages = (
    current: Message[],
    latest: MessageResponse[],
    userId?: string
): Message[] => {
    const fetched = addIsOwnToMessages(deduplicateMessages(latest), userId);
    const fetchedIds = new Set(fetched.map((m) => m.id));
    const optimistic = current.filter((m) => m.isOptimistic);
    const kept = current.filter((m) => !m.isOptimistic && !fetchedIds.has(m.id));
    const confirmed = [...kept, ...fetched].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
    return [...confirmed, ...optimistic];
};
