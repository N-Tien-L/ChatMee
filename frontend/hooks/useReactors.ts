import { useCallback, useEffect, useState } from "react";
import { messageApi } from "@/lib/api/messageApi";
import type { Reactor } from "@/lib/types";

const PAGE_SIZE = 20;
/** Unique per request, so reopening the same list never mistakes an old answer for the new request. */
let attempts = 0;

/** The last answered request for a key; a request whose attempt has no page yet is loading. */
type Page = {
    key: string;
    attempt: number;
    reactors: Reactor[];
    cursor: string | null;
    hasMore: boolean;
    error: string | null;
};

/**
 * Who reacted to one message, newest first and cursor-paged (SPEC-015 AC-015-6). `messageId` null means closed;
 * `emoji` null lists every emoji. State belongs to one (message, emoji) key, so changing either starts over and a
 * late response for the previous key is dropped.
 */
export function useReactors(roomId: string, messageId: string | null, emoji: string | null) {
    const key = messageId ? `${roomId}|${messageId}|${emoji ?? ""}` : "";
    const [page, setPage] = useState<Page | null>(null);
    const [request, setRequest] = useState<{ key: string; from: string | null; attempt: number } | null>(null);

    // Each opening starts with its first page; closing forgets the request so reopening refetches.
    if (key && request?.key !== key) setRequest({ key, from: null, attempt: ++attempts });
    if (!key && request) setRequest(null);

    useEffect(() => {
        if (!messageId || !request || request.key !== key) return;
        let current = true;
        const { from, attempt } = request;
        messageApi.getReactors(roomId, messageId, { emoji: emoji ?? undefined, cursor: from ?? undefined, limit: PAGE_SIZE })
            .then((res) => {
                if (!current) return;
                if (!res?.success) throw new Error(res?.message || "Could not load reactions");
                setPage((previous) => ({
                    key,
                    attempt,
                    reactors: from && previous?.key === key ? [...previous.reactors, ...res.data.reactions] : res.data.reactions,
                    cursor: res.data.nextCursor,
                    hasMore: res.data.hasMore,
                    error: null,
                }));
            })
            .catch(() => {
                if (!current) return;
                setPage((previous) => (previous?.key === key
                    ? { ...previous, attempt, error: "Could not load reactions" }
                    : { key, attempt, reactors: [], cursor: null, hasMore: false, error: "Could not load reactions" }));
            });
        return () => {
            current = false;
        };
    }, [roomId, messageId, emoji, key, request]);

    const own = page?.key === key && key ? page : null;
    const loading = !!key && request?.key === key && own?.attempt !== request.attempt;

    const loadMore = useCallback(() => {
        if (own && !loading && own.hasMore && own.cursor) {
            setRequest({ key, from: own.cursor, attempt: ++attempts });
        }
    }, [own, key, loading]);

    const retry = useCallback(() => {
        setRequest({ key, from: own && own.reactors.length > 0 ? own.cursor : null, attempt: ++attempts });
    }, [own, key]);

    return {
        reactors: own?.reactors ?? [],
        hasMore: own?.hasMore ?? false,
        loading,
        error: loading ? null : own?.error ?? null,
        loadMore,
        retry,
    };
}
