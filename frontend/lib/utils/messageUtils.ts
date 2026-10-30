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

// Match the existing Mongo history tie-break (String @Id maps 24-hex to ObjectId).
// Cursors remain opaque; this only orders confirmed live rows alongside REST pages.
const compareIds = (a: string, b: string) => {
    const objectA = /^[0-9a-f]{24}$/i.test(a);
    const objectB = /^[0-9a-f]{24}$/i.test(b);
    if (objectA !== objectB) return objectA ? 1 : -1;
    const left = objectA ? a.toLowerCase() : a;
    const right = objectB ? b.toLowerCase() : b;
    return left < right ? -1 : left > right ? 1 : 0;
};

const timeOf = (createdAt: string) => {
    const time = Date.parse(createdAt);
    return Number.isNaN(time) ? 0 : time;
};

/** Client-side failure codes stored on a failed optimistic message. */
export const TIMEOUT_ERROR_CODE = "TIMEOUT";
export const NOT_SENT_ERROR_CODE = "NOT_SENT";

/**
 * Maximum distance between the client createdAt of a pending message and the server createdAt of
 * its saved copy. It covers the 10 s confirmation timeout plus clock skew between client and server.
 */
export const PENDING_MATCH_WINDOW_MS = 30_000;

/**
 * Only messages that may have reached the server can be confirmed by a resync: still sending, or
 * failed because the confirmation timed out. A server error or an unpublished frame means not saved.
 */
const mayHaveBeenSaved = (m: Message) =>
    m.isOptimistic === true && !!m.tempId &&
    (m.status === "sending" || (m.status === "failed" && m.errorCode === TIMEOUT_ERROR_CODE));

/**
 * Finds the server copies of pending optimistic messages whose confirmation was lost (e.g. during a
 * disconnect). A server copy that carries a client id (clientMessageId, or tempId on a broadcast)
 * matches only the pending message with that id, however late the resync is. Copies without one
 * (stored before client ids existed) fall back to the heuristic: same sender (me), same trimmed content,
 * server createdAt within PENDING_MATCH_WINDOW_MS of the optimistic createdAt, and a server message
 * not already on screen. Each server message confirms at most one pending message (oldest pending
 * first, nearest createdAt wins), so two identical sends are not collapsed into one.
 * Returns tempId -> server message.
 */
export const matchResyncedPending = (
    current: Message[],
    latest: MessageResponse[],
    userId?: string
): Map<string, MessageResponse> => {
    const matches = new Map<string, MessageResponse>();
    if (!userId) return matches;
    const onScreen = new Set(current.filter((m) => !m.isOptimistic).map((m) => m.id));
    const candidates = latest.filter((m) => m.senderId === userId && (!!(m.clientMessageId ?? m.tempId) || !onScreen.has(m.id)));
    const claimed = new Set<string>();
    const pending = current
        .filter(mayHaveBeenSaved)
        .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));

    for (const message of pending) {
        const tempId = message.tempId as string;
        const sentAt = timeOf(message.createdAt);
        let best: MessageResponse | undefined;
        let bestDelta = Infinity;
        for (const candidate of candidates) {
            if (claimed.has(candidate.id)) continue;
            const clientId = candidate.clientMessageId ?? candidate.tempId;
            if (clientId) {
                if (clientId !== tempId) continue;
                best = candidate;
                break;
            }
            if (candidate.content.trim() !== message.content.trim()) continue;
            const delta = Math.abs(timeOf(candidate.createdAt) - sentAt);
            if (delta <= PENDING_MATCH_WINDOW_MS && delta < bestDelta) {
                best = candidate;
                bestDelta = delta;
            }
        }
        if (best) {
            claimed.add(best.id);
            matches.set(tempId, best);
        }
    }
    return matches;
};

/**
 * Merges a freshly fetched history page into the messages on screen (resync after reconnect).
 * Server copies win by id, confirmed messages outside the page are kept, the result is ordered by
 * createdAt, pending optimistic messages matched by matchResyncedPending are replaced by their
 * server copy, and the other pending/failed optimistic messages stay at the end unchanged.
 */
export const mergeResyncedMessages = (
    current: Message[],
    latest: MessageResponse[],
    userId?: string
): Message[] => {
    const fetched = addIsOwnToMessages(deduplicateMessages(latest), userId);
    const fetchedIds = new Set(fetched.map((m) => m.id));
    const confirmedTempIds = matchResyncedPending(current, latest, userId);
    const optimistic = current.filter(
        (m) => !!m.isOptimistic && !(m.tempId && confirmedTempIds.has(m.tempId))
    );
    const kept = current.filter((m) => !m.isOptimistic && !fetchedIds.has(m.id));
    const confirmed = [...kept, ...fetched].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || compareIds(a.id, b.id));
    return [...confirmed, ...optimistic];
};
