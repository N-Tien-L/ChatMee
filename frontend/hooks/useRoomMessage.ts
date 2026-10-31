import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { StompError, useWebSocket } from "./useWebSocket";
import { messageApi } from "@/lib/api/messageApi";
import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { Message, MessageResponse, MessageType } from "@/lib/types";
import {
    deduplicateMessages,
    matchResyncedPending,
    mergeResyncedMessages,
    NOT_SENT_ERROR_CODE,
    TIMEOUT_ERROR_CODE,
    updateSessionCache,
} from "@/lib/utils/messageUtils";
import { initialState, messageReducer } from "./reducers/messageReducer";

// Cache messages per room for current session
let cacheEpoch = 0;
const sessionCache = new Map<
    string,
    { messages: MessageResponse[]; hasMoreMessages: boolean; nextCursor: string | null; lastLoaded: number }
>();

/** Drops every cached room page; called on logout so the next account never sees them. */
export function resetRoomMessageCache(): void {
    cacheEpoch++;
    sessionCache.clear();
}

/** Where loadOlder continues for the open room; replaced on every room change. */
type Paging = { roomId: string; nextCursor: string | null; hasMore: boolean; inFlight: boolean };

const ROOM_DELETED_CONTENT = "This room has been deleted";

/** The CM-028 room-deleted event: a SYSTEM message without id (see websocket-protocol.md). */
const isRoomDeletedEvent = (message: Message) =>
    message.type === MessageType.SYSTEM && !message.id && message.content === ROOM_DELETED_CONTENT;

/** Reloads one room into the rooms store so member counts follow joins/leaves the user events do not announce. */
const refreshRoom = (roomId: string) => {
    Promise.resolve(chatRoomApi.getChatRoomById(roomId))
        .then((res) => {
            if (res?.success) useChatRoomsStore.getState().upsertRoom(res.data);
        })
        .catch(() => {
            // The next reconnect refetch recovers the room.
        });
};

function isApiError(err: unknown): err is { response?: { data?: { detail?: string } }, message?: string } {
    return typeof err === "object" && err !== null;
}

const errorText = (err: unknown, fallback: string) =>
    (isApiError(err) && (err.response?.data?.detail || err.message)) || fallback;

interface RoomMessagesOptions {
    onRoomDeleted?: () => void;
}

export const useRoomMessages = (roomId: string, options: RoomMessagesOptions = {}) => {
    const [state, dispatch] = useReducer(messageReducer, initialState)
    const { user } = useAuthStore();
    const userId = user?.id;
    const cacheKey = `${userId ?? "guest"}:${roomId}`;
    const generation = useRef(0);
    const initialLoaded = useRef(false);
    const confirmedHead = useRef<string | undefined>(undefined);
    const recoveryRef = useRef<{
        anchor: string | undefined; before?: string; pages: MessageResponse[];
        seen: Set<string>; busy: boolean; retryAt: number; stopped: boolean;
    } | null>(null);
    const [recovery, setRecovery] = useState<"idle" | "loading" | "incomplete" | "error" | "stopped">("idle");
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    // Latest messages for callbacks (resend, resync) without re-creating them on every message.
    const messagesRef = useRef(state.messages);
    useEffect(() => {
        messagesRef.current = state.messages;
    }, [state.messages]);
    const [reloadCount, setReloadCount] = useState(0);
    const onRoomDeletedRef = useRef(options.onRoomDeleted);
    useEffect(() => {
        onRoomDeletedRef.current = options.onRoomDeleted;
    }, [options.onRoomDeleted]);
    const clearPendingTimer = useCallback((tempId: string) => {
        const timer = pendingTimers.current.get(tempId);
        if (timer !== undefined) clearTimeout(timer);
        pendingTimers.current.delete(tempId);
    }, []);

    // Kept outside the reducer so two scroll events before the next render cannot send the same
    // cursor twice, and so a page that arrives after a room switch is recognised and ignored.
    const pagingRef = useRef<Paging>({ roomId, nextCursor: null, hasMore: false, inFlight: false });

    // Members may have joined while this room was closed: refresh it whenever it is opened.
    useEffect(() => {
        if (roomId) refreshRoom(roomId);
    }, [roomId]);

    useEffect(() => {
        // History loads merge into what is on screen, so a new room must start empty.
        generation.current++;
        initialLoaded.current = false;
        confirmedHead.current = undefined;
        recoveryRef.current = null;
        setRecovery("idle");
        setRecoveryError(null);
        messagesRef.current = [];
        dispatch({ type: "RESET" });
        pagingRef.current = { roomId, nextCursor: null, hasMore: false, inFlight: false };
        const timers = pendingTimers.current;
        return () => {
            generation.current++;
            timers.forEach(clearTimeout);
            timers.clear();
        };
    }, [roomId, userId]);
    const {
        connected,
        connecting,
        subscribeRoom,
        sendMessage: sendWebSocketMessage,
        subscribeErrors,
        onReconnect,
        getLastReconnectAt,
    } = useWebSocket();

    // Freeze the head while disconnected or recovering: a live frame from the new
    // connection must not become the overlap anchor ahead of an unresolved gap.
    useEffect(() => {
        if (connected && recovery === "idle" && initialLoaded.current) {
            confirmedHead.current = mergeResyncedMessages(state.messages, [], userId).filter(m => !m.isOptimistic && m.id).at(-1)?.id;
        }
    }, [connected, recovery, state.messages, userId]);

    // Effect for loading the newest page (from cache or API)
    useEffect(() => {
        let active = true;
        const requestGeneration = generation.current;
        const epoch = cacheEpoch;
        const loadMessages = async () => {
            if (!roomId || !userId) return;
            const paging = pagingRef.current;

            // A cache filled before the last reconnect may miss messages sent while disconnected.
            const cached = sessionCache.get(cacheKey);
            if (cached && cached.lastLoaded >= getLastReconnectAt()) {
                initialLoaded.current = true;
                paging.nextCursor = cached.nextCursor;
                paging.hasMore = cached.hasMoreMessages;
                dispatch({
                    type: "FETCH_SUCCESS",
                    payload: {
                        messages: cached.messages,
                        hasMore: cached.hasMoreMessages,
                        nextCursor: cached.nextCursor,
                        userId,
                    }
                })
                return;
            }

            dispatch({ type: "FETCH_START" });
            try {
                const res = await messageApi.getMessages(roomId);
                if (!active || requestGeneration !== generation.current || epoch !== cacheEpoch) return;
                if (!res.success) throw new Error(res.message || "Failed to load messages");

                initialLoaded.current = true;
                const unique = deduplicateMessages(res.data?.messages ?? []);
                const nextCursor = res.data?.nextCursor ?? null;
                const hasMore = !!res.data?.hasMore && nextCursor !== null;
                paging.nextCursor = nextCursor;
                paging.hasMore = hasMore;
                dispatch({ type: "FETCH_SUCCESS", payload: { messages: unique, hasMore, nextCursor, userId } });
                sessionCache.set(cacheKey, {
                    messages: unique, hasMoreMessages: hasMore, nextCursor, lastLoaded: Date.now(),
                });
            } catch (err: unknown) {
                if (!active || requestGeneration !== generation.current || epoch !== cacheEpoch) return;
                paging.nextCursor = null;
                paging.hasMore = false;
                dispatch({ type: "FETCH_ERROR", payload: errorText(err, "Failed to load messages") });
            }
        };

        loadMessages();
        return () => {
            active = false;
        };
    }, [roomId, userId, cacheKey, getLastReconnectAt, reloadCount]);

    /** Retries the initial history load after a failure. */
    const reload = useCallback(() => setReloadCount((count) => count + 1), []);

    /**
     * Loads the page before the oldest loaded message (scroll to top, or Retry after a failure).
     * At most one request per room is in flight; a page for a room that is no longer open is dropped.
     */
    const loadOlder = useCallback(async () => {
        const paging = pagingRef.current;
        const epoch = cacheEpoch;
        const requestGeneration = generation.current;
        if (recoveryRef.current || paging.roomId !== roomId || paging.inFlight || !paging.hasMore || !paging.nextCursor) return;
        paging.inFlight = true;
        dispatch({ type: "LOAD_OLDER_START" });
        try {
            const res = await messageApi.getMessages(roomId, { before: paging.nextCursor });
            if (pagingRef.current !== paging || epoch !== cacheEpoch || requestGeneration !== generation.current) return;
            if (!res.success || !res.data) throw new Error(res.message || "Failed to load older messages");

            const older = deduplicateMessages(res.data.messages ?? []);
            const nextCursor = res.data.nextCursor ?? null;
            const hasMore = res.data.hasMore && nextCursor !== null;
            paging.nextCursor = nextCursor;
            paging.hasMore = hasMore;
            dispatch({ type: "LOAD_OLDER_SUCCESS", payload: { messages: older, hasMore, nextCursor, userId } });
            const cached = sessionCache.get(cacheKey);
            if (cached) {
                sessionCache.set(cacheKey, {
                    ...cached,
                    messages: mergeResyncedMessages(cached.messages, older),
                    hasMoreMessages: hasMore,
                    nextCursor,
                });
            }
        } catch (err: unknown) {
            if (pagingRef.current !== paging || epoch !== cacheEpoch || requestGeneration !== generation.current) return;
            dispatch({ type: "LOAD_OLDER_ERROR", payload: errorText(err, "Failed to load older messages") });
        } finally {
            paging.inFlight = false;
        }
    }, [roomId, userId, cacheKey]);

    // Buffered history is published only when it reaches the saved contiguous segment.
    // Live frames remain visible and the banner marks the conversation incomplete meanwhile.
    const recover = useCallback(async (restart = false) => {
        if (!roomId || !userId) return;
        const previous = recoveryRef.current;
        if (previous?.stopped) return;
        if (!restart && previous?.busy) return;
        const token = restart ? ++generation.current : generation.current;
        const epoch = cacheEpoch;
        const run = restart || !previous ? {
            anchor: previous ? previous.anchor : initialLoaded.current
                ? confirmedHead.current : undefined,
            before: undefined as string | undefined, pages: [] as MessageResponse[],
            seen: new Set<string>(), busy: false, retryAt: previous?.retryAt ?? 0, stopped: false,
        } : previous;
        recoveryRef.current = run;
        if (restart) {
            // An older request can remain unresolved after a new connection succeeds.
            pagingRef.current = { ...pagingRef.current, inFlight: false };
        }
        if (Date.now() < run.retryAt) return;
        // Incomplete pages must never become a reusable contiguous cache.
        sessionCache.delete(cacheKey);
        const valid = () => recoveryRef.current === run && token === generation.current && epoch === cacheEpoch;
        run.busy = true;
        setRecovery("loading");
        setRecoveryError(null);
        try {
            for (let count = 0; count < 10; count++) {
                const res = run.before
                    ? await messageApi.getMessages(roomId, { before: run.before })
                    : await messageApi.getMessages(roomId);
                if (!valid()) return;
                if (!res.success || !Array.isArray(res.data?.messages)) throw new Error("Could not recover messages");
                const page = res.data;
                const complete = !run.anchor || page.messages.some(m => m.id === run.anchor) || !page.hasMore;
                if (!complete && (!page.nextCursor || run.seen.has(page.nextCursor))) {
                    throw new Error("History cursor did not advance. Retry recovery.");
                }
                run.pages = deduplicateMessages([...page.messages, ...run.pages]);
                if (complete) {
                    matchResyncedPending(messagesRef.current, run.pages, userId)
                        .forEach((_, tempId) => clearPendingTimer(tempId));
                    const paging = pagingRef.current;
                    // With no initial segment, the successful page establishes normal older navigation.
                    if (!run.anchor) {
                        paging.nextCursor = page.nextCursor;
                        paging.hasMore = page.hasMore && !!page.nextCursor;
                    }
                    const merged = mergeResyncedMessages(messagesRef.current, run.pages, userId);
                    dispatch({ type: "FETCH_SUCCESS", payload: {
                        messages: run.pages, userId,
                        nextCursor: paging.nextCursor, hasMore: paging.hasMore,
                    } });
                    messagesRef.current = merged;
                    initialLoaded.current = true;
                    sessionCache.set(cacheKey, {
                        messages: merged.filter(m => !m.isOptimistic), hasMoreMessages: paging.hasMore,
                        nextCursor: paging.nextCursor, lastLoaded: Date.now(),
                    });
                    recoveryRef.current = null;
                    setRecovery("idle");
                    return;
                }
                run.before = page.nextCursor!;
                run.seen.add(run.before);
            }
            setRecovery("incomplete");
        } catch (err: unknown) {
            if (!valid()) return;
            // apiClient preserves the Axios response as Error.cause.
            const cause = err instanceof Error && err.cause ? err.cause : err;
            const response = (cause as { response?: { status?: number; headers?: Record<string, unknown> } })?.response;
            const status = response?.status;
            if (status === 401 || status === 403 || status === 404) {
                run.stopped = true;
                setRecovery("stopped");
                setRecoveryError(status === 401 ? "Your session ended. Sign in again." : "You are no longer a member");
                if (status !== 401) useChatRoomsStore.getState().deleteRoom(roomId);
                return;
            }
            if (status === 429) {
                const header = String(response?.headers?.["retry-after"] ?? "1");
                const seconds = Number(header);
                run.retryAt = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000
                    : Math.max(Date.now(), Date.parse(header) || Date.now() + 1000);
                setRecoveryError("Too many requests. Retry after " + new Date(run.retryAt).toLocaleTimeString() + ".");
            } else setRecoveryError(errorText(err, "Could not recover messages"));
            setRecovery("error");
        } finally {
            run.busy = false;
        }
    }, [roomId, userId, cacheKey, clearPendingTimer]);

    useEffect(() => onReconnect(() => { void recover(true); }), [onReconnect, recover]);
    const continueRecovery = useCallback(() => { void recover(); }, [recover]);

    // Effect for room and error subscriptions; the session keeps them across reconnects.
    useEffect(() => {
        if (!roomId || !userId) return;
        let active = true;
        const epoch = cacheEpoch;

        // 1. Subscribe to new messages
        const handleNewMessage = (message: Message) => {
            if (!active || epoch !== cacheEpoch) return;
            if (isRoomDeletedEvent(message)) {
                onRoomDeletedRef.current?.();
                return;
            }
            // Joined/left/role system messages change the member list: refresh the room so counts stay right.
            if (message.type === MessageType.SYSTEM) {
                refreshRoom(roomId);
            }
            // Update the callback snapshot before React commits: REST may settle in this
            // same turn and must include this live frame in the recovered cache.
            if (message.tempId && message.senderId === userId) clearPendingTimer(message.tempId);
            const action = message.tempId && message.senderId === userId
                ? { type: "CONFIRM_SENT_MESSAGE" as const, payload: message }
                : { type: "RECEIVE_WEBSOCKET_MESSAGE" as const, payload: { message, userId } };
            messagesRef.current = messageReducer({ ...initialState, messages: messagesRef.current }, action).messages;
            dispatch(action);
            updateSessionCache(sessionCache, cacheKey, [message]);
        };

        // 2. Subscribe to delivery errors
        const handleError = (error: StompError) => {
            if (!active || epoch !== cacheEpoch) return;
            if (error.tempId) {
                clearPendingTimer(error.tempId);
                dispatch({
                    type: "FAIL_SENT_MESSAGE",
                    payload: { tempId: error.tempId, error: error.message, code: error.code },
                });
            }
        };
        const removeErrorHandler = subscribeErrors(handleError);
        const unsubscribeRoom = subscribeRoom(roomId, handleNewMessage);
        return () => {
            active = false;
            unsubscribeRoom();
            removeErrorHandler();
        };
    }, [roomId, cacheKey, subscribeRoom, userId, subscribeErrors, clearPendingTimer]);

    // A new send gets a new client id; a Resend passes the failed message's id so the server can
    // recognise a retry of a send it already stored (SPEC-008 AC-008-13).
    const createOptimisticMessage = useCallback((content: string, tempId = `temp-${Date.now()}-${Math.random()}`): Message | null => {
        if (!user) return null;
        const now = new Date().toISOString();
        return {
            id: `optimistic-${tempId}`,
            tempId,
            chatRoomId: roomId,
            senderId: user.id,
            senderName: user.name,
            content,
            type: MessageType.TEXT,
            createdAt: now,
            updatedAt: now,
            isOwn: true,
            status: "sending",
            isOptimistic: true,
            isDeleted: false,
            isUpdated: false,
        };
    }, [roomId, user]);

    // Publishes an optimistic message that is already in state and arms its confirmation timeout.
    const deliver = useCallback((message: Message) => {
        const tempId = message.tempId as string;
        const epoch = cacheEpoch;
        pendingTimers.current.set(tempId, setTimeout(() => {
            if (epoch !== cacheEpoch) return;
            pendingTimers.current.delete(tempId);
            dispatch({
                type: "FAIL_SENT_MESSAGE",
                payload: { tempId, error: "Message confirmation timed out", code: TIMEOUT_ERROR_CODE },
            });
        }, 10_000));

        let published: boolean;
        try {
            published = sendWebSocketMessage(roomId, message.content, tempId);
        } catch {
            published = false;
        }
        if (published === false) {
            clearPendingTimer(tempId);
            dispatch({
                type: "FAIL_SENT_MESSAGE",
                payload: { tempId, error: "Failed to send", code: NOT_SENT_ERROR_CODE },
            });
        }
    }, [roomId, sendWebSocketMessage, clearPendingTimer]);

    // Action for sending a message
    /** Returns the tempId of the optimistic message, so callers can follow its confirmation. */
    const sendMessage = useCallback((content: string): string | undefined => {
        if (!connected || !content.trim()) return undefined;
        const optimisticMessage = createOptimisticMessage(content.trim());
        if (!optimisticMessage) return undefined;
        dispatch({ type: "ADD_OPTIMISTIC_MESSAGE", payload: optimisticMessage });
        deliver(optimisticMessage);
        return optimisticMessage.tempId;
    }, [connected, createOptimisticMessage, deliver]);

    /** Sends a failed message again as a new attempt with the same client id, replacing the failed copy. */
    const resendMessage = useCallback((tempId: string) => {
        if (!connected) return;
        const failed = messagesRef.current.find(
            (m) => m.isOptimistic && m.tempId === tempId && m.status === "failed"
        );
        if (!failed) return;
        const retry = createOptimisticMessage(failed.content, tempId);
        if (!retry) return;
        dispatch({ type: "RESEND_MESSAGE", payload: { tempId, message: retry } });
        deliver(retry);
    }, [connected, createOptimisticMessage, deliver]);

    /** Removes a failed message from the list. */
    const discardMessage = useCallback((tempId: string) => {
        dispatch({ type: "DISCARD_MESSAGE", payload: { tempId } });
    }, []);

    return {
        ...state,
        recovery,
        recoveryError,
        continueRecovery,
        connected,
        connecting,
        sendMessage,
        resendMessage,
        discardMessage,
        reload: recovery === "idle" ? reload : continueRecovery,
        loadOlder,
    };
};

/** Display names of a room's members by user id, from GET /rooms/{id}/members (UX-14). Reloads when the member count changes. */
export const useRoomMemberNames = (roomId: string, memberCount: number): Record<string, string> => {
    const [names, setNames] = useState<Record<string, string>>({});
    useEffect(() => {
        let active = true;
        chatRoomApi.getMembers(roomId)
            .then((res) => {
                if (!active || !res.success || !Array.isArray(res.data)) return;
                setNames(Object.fromEntries(res.data.map((member) => [member.id, member.name])));
            })
            .catch(() => {
                // Typing falls back to "Someone" when the member list is unavailable.
            });
        return () => {
            active = false;
        };
    }, [roomId, memberCount]);
    return names;
};
