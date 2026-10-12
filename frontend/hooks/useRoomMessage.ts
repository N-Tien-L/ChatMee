import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { StompError, useWebSocket } from "./useWebSocket";
import { messageApi } from "@/lib/api/messageApi";
import { useAuthStore } from "@/lib/stores/authStore";
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
const sessionCache = new Map<
    string,
    { messages: MessageResponse[]; hasMoreMessages: boolean; nextCursor: string | null; lastLoaded: number }
>();

/** Drops every cached room page; called on logout so the next account never sees them. */
export function resetRoomMessageCache(): void {
    sessionCache.clear();
}

/** Where loadOlder continues for the open room; replaced on every room change. */
type Paging = { roomId: string; nextCursor: string | null; hasMore: boolean; inFlight: boolean };

const ROOM_DELETED_CONTENT = "This room has been deleted";

/** The CM-028 room-deleted event: a SYSTEM message without id (see websocket-protocol.md). */
const isRoomDeletedEvent = (message: Message) =>
    message.type === MessageType.SYSTEM && !message.id && message.content === ROOM_DELETED_CONTENT;

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

    useEffect(() => {
        // History loads merge into what is on screen, so a new room must start empty.
        dispatch({ type: "RESET" });
        pagingRef.current = { roomId, nextCursor: null, hasMore: false, inFlight: false };
        const timers = pendingTimers.current;
        return () => {
            timers.forEach(clearTimeout);
            timers.clear();
        };
    }, [roomId]);
    const {
        connected,
        connecting,
        subscribeRoom,
        sendMessage: sendWebSocketMessage,
        subscribeErrors,
        onReconnect,
        getLastReconnectAt,
    } = useWebSocket();

    // Effect for loading the newest page (from cache or API)
    useEffect(() => {
        let active = true;
        const loadMessages = async () => {
            if (!roomId) return;
            const paging = pagingRef.current;

            // A cache filled before the last reconnect may miss messages sent while disconnected.
            const cached = sessionCache.get(roomId);
            if (cached && cached.lastLoaded >= getLastReconnectAt()) {
                paging.nextCursor = cached.nextCursor;
                paging.hasMore = cached.hasMoreMessages;
                dispatch({
                    type: "FETCH_SUCCESS",
                    payload: {
                        messages: cached.messages,
                        hasMore: cached.hasMoreMessages,
                        nextCursor: cached.nextCursor,
                        userId: user?.id,
                    }
                })
                return;
            }

            dispatch({ type: "FETCH_START" });
            try {
                const res = await messageApi.getMessages(roomId);
                if (!active) return;
                if (!res.success) throw new Error(res.message || "Failed to load messages");

                const unique = deduplicateMessages(res.data?.messages ?? []);
                const nextCursor = res.data?.nextCursor ?? null;
                const hasMore = !!res.data?.hasMore && nextCursor !== null;
                paging.nextCursor = nextCursor;
                paging.hasMore = hasMore;
                dispatch({ type: "FETCH_SUCCESS", payload: { messages: unique, hasMore, nextCursor, userId: user?.id } });
                sessionCache.set(roomId, {
                    messages: unique, hasMoreMessages: hasMore, nextCursor, lastLoaded: Date.now(),
                });
            } catch (err: unknown) {
                if (!active) return;
                paging.nextCursor = null;
                paging.hasMore = false;
                dispatch({ type: "FETCH_ERROR", payload: errorText(err, "Failed to load messages") });
            }
        };

        loadMessages();
        return () => {
            active = false;
        };
    }, [roomId, user?.id, getLastReconnectAt, reloadCount]);

    /** Retries the initial history load after a failure. */
    const reload = useCallback(() => setReloadCount((count) => count + 1), []);

    /**
     * Loads the page before the oldest loaded message (scroll to top, or Retry after a failure).
     * At most one request per room is in flight; a page for a room that is no longer open is dropped.
     */
    const loadOlder = useCallback(async () => {
        const paging = pagingRef.current;
        if (paging.roomId !== roomId || paging.inFlight || !paging.hasMore || !paging.nextCursor) return;
        paging.inFlight = true;
        dispatch({ type: "LOAD_OLDER_START" });
        try {
            const res = await messageApi.getMessages(roomId, { before: paging.nextCursor });
            if (pagingRef.current !== paging) return;
            if (!res.success || !res.data) throw new Error(res.message || "Failed to load older messages");

            const older = deduplicateMessages(res.data.messages ?? []);
            const nextCursor = res.data.nextCursor ?? null;
            const hasMore = res.data.hasMore && nextCursor !== null;
            paging.nextCursor = nextCursor;
            paging.hasMore = hasMore;
            dispatch({ type: "LOAD_OLDER_SUCCESS", payload: { messages: older, hasMore, nextCursor, userId: user?.id } });
            const cached = sessionCache.get(roomId);
            if (cached) {
                sessionCache.set(roomId, {
                    ...cached,
                    messages: mergeResyncedMessages(cached.messages, older),
                    hasMoreMessages: hasMore,
                    nextCursor,
                });
            }
        } catch (err: unknown) {
            if (pagingRef.current !== paging) return;
            dispatch({ type: "LOAD_OLDER_ERROR", payload: errorText(err, "Failed to load older messages") });
        } finally {
            paging.inFlight = false;
        }
    }, [roomId, user?.id]);

    // Resync after a reconnect: refetch the newest page and merge it by message id. Older pages
    // already on screen are kept, and so is the cursor to page further back.
    useEffect(() => {
        if (!roomId) return;
        let active = true;
        const removeListener = onReconnect(() => {
            void (async () => {
                try {
                    const res = await messageApi.getMessages(roomId);
                    if (!active || !res.success || !Array.isArray(res.data?.messages)) return;
                    const latest = deduplicateMessages(res.data.messages);
                    // Pending messages saved while the confirmation was lost are confirmed, not failed.
                    matchResyncedPending(messagesRef.current, latest, user?.id)
                        .forEach((_, tempId) => clearPendingTimer(tempId));
                    dispatch({ type: "RESYNC", payload: { messages: latest, userId: user?.id } });
                    const cached = sessionCache.get(roomId);
                    sessionCache.set(roomId, {
                        messages: mergeResyncedMessages(cached?.messages ?? [], latest),
                        hasMoreMessages: cached ? cached.hasMoreMessages : res.data.hasMore && res.data.nextCursor !== null,
                        nextCursor: cached ? cached.nextCursor : res.data.nextCursor ?? null,
                        lastLoaded: Date.now(),
                    });
                } catch {
                    // Keep the current messages; the next reconnect or room open retries.
                }
            })();
        });
        return () => {
            active = false;
            removeListener();
        };
    }, [roomId, user?.id, onReconnect, clearPendingTimer]);

    // Effect for room and error subscriptions; the session keeps them across reconnects.
    useEffect(() => {
        if (!roomId) return;

        // 1. Subscribe to new messages
        const handleNewMessage = (message: Message) => {
            if (isRoomDeletedEvent(message)) {
                onRoomDeletedRef.current?.();
                return;
            }
            // Check if this message confirms one we sent optimistically
            if (message.tempId && message.senderId === user?.id) {
                clearPendingTimer(message.tempId);
                dispatch({ type: "CONFIRM_SENT_MESSAGE", payload: message });
            } else {
                dispatch({ type: "RECEIVE_WEBSOCKET_MESSAGE", payload: { message, userId: user?.id } });
            }
            updateSessionCache(sessionCache, roomId, [message]);
        };

        // 2. Subscribe to delivery errors
        const handleError = (error: StompError) => {
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
            unsubscribeRoom();
            removeErrorHandler();
        };
    }, [roomId, subscribeRoom, user?.id, subscribeErrors, clearPendingTimer]);

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
        pendingTimers.current.set(tempId, setTimeout(() => {
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
    const sendMessage = useCallback(async (content: string) => {
        if (!connected || !content.trim()) return;
        const optimisticMessage = createOptimisticMessage(content.trim());
        if (!optimisticMessage) return;
        dispatch({ type: "ADD_OPTIMISTIC_MESSAGE", payload: optimisticMessage });
        deliver(optimisticMessage);
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
        connected,
        connecting,
        sendMessage,
        resendMessage,
        discardMessage,
        reload,
        loadOlder,
    };
};
