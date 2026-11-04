import { useCallback, useEffect, useRef, useState } from "react";
import { messageApi } from "@/lib/api/messageApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { Message } from "@/lib/types";

/**
 * A window of history around an original that is not loaded (SPEC-014 AC-014-8). It is shown instead of the live
 * list, never merged into it, so it can never look continuous with the live tail (CM-095).
 */
export interface DetachedSegment {
    roomId: string;
    userId: string | undefined;
    targetId: string;
    messages: Message[];
    hasBefore: boolean;
    hasAfter: boolean;
}

export type ContextLoad = { state: "idle" } | { state: "loading"; targetId: string } | { state: "error"; message: string };
type ScopedLoad = { roomId: string; userId: string | undefined; load: ContextLoad };

const UNAVAILABLE = "Original message unavailable";

/** Axios errors are preserved as Error.cause by apiClient. */
const statusOf = (err: unknown) => {
    const cause = err instanceof Error && err.cause ? err.cause : err;
    return (cause as { response?: { status?: number } })?.response?.status;
};

export function useMessageContext(roomId: string) {
    const userId = useAuthStore((state) => state.user?.id);
    const [segment, setSegment] = useState<DetachedSegment | null>(null);
    const [scoped, setScoped] = useState<ScopedLoad | null>(null);
    // A response for an earlier jump, room or account is ignored; state of another room or account is never returned.
    const requestRef = useRef(0);
    const scopeRef = useRef({ roomId, userId });
    useEffect(() => {
        requestRef.current++;
        scopeRef.current = { roomId, userId };
    }, [roomId, userId]);
    const setLoad = useCallback((load: ContextLoad) => setScoped({ roomId, userId, load }), [roomId, userId]);

    const jumpTo = useCallback(async (messageId: string) => {
        const request = ++requestRef.current;
        setLoad({ state: "loading", targetId: messageId });
        try {
            const res = await messageApi.getContext(roomId, messageId);
            const stale = () => request !== requestRef.current
                || scopeRef.current.roomId !== roomId || scopeRef.current.userId !== userId;
            if (stale()) return;
            if (!res.success || !res.data) throw new Error(res.message || "Could not load the original message");
            setSegment({
                roomId,
                userId,
                targetId: res.data.targetId,
                hasBefore: res.data.hasBefore,
                hasAfter: res.data.hasAfter,
                messages: res.data.messages.map((m) => ({ ...m, isOwn: m.senderId === userId, status: "sent" })),
            });
            setLoad({ state: "idle" });
        } catch (err: unknown) {
            if (request !== requestRef.current || scopeRef.current.roomId !== roomId
                || scopeRef.current.userId !== userId) return;
            setLoad({
                state: "error",
                message: statusOf(err) === 404 ? UNAVAILABLE : "Could not load the original message. Try again.",
            });
        }
    }, [roomId, userId, setLoad]);

    /** Leaves the segment and returns to the live conversation. */
    const close = useCallback(() => {
        requestRef.current++;
        setSegment(null);
        setScoped(null);
    }, []);

    const current = (value: { roomId: string; userId: string | undefined } | null) =>
        !!value && value.roomId === roomId && value.userId === userId;
    return {
        segment: current(segment) ? segment : null,
        load: current(scoped) ? scoped!.load : ({ state: "idle" } as ContextLoad),
        jumpTo,
        close,
    };
}
