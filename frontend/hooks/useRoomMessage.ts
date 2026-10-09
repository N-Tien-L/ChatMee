import { useCallback, useEffect, useReducer, useRef } from "react";
import { StompError, useWebSocket } from "./useWebSocket";
import { messageApi } from "@/lib/api/messageApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { Message, MessageResponse, MessageType } from "@/lib/types";
import {
    deduplicateMessages,
    mergeResyncedMessages,
    updateSessionCache,
} from "@/lib/utils/messageUtils";
import { initialState, messageReducer } from "./reducers/messageReducer";

// Cache messages per room for current session
const sessionCache = new Map<
    string,
    { messages: MessageResponse[]; hasMoreMessages: boolean; lastLoaded: number }
>();

const ROOM_DELETED_CONTENT = "This room has been deleted";

/** The CM-028 room-deleted event: a SYSTEM message without id (see websocket-protocol.md). */
const isRoomDeletedEvent = (message: Message) =>
    message.type === MessageType.SYSTEM && !message.id && message.content === ROOM_DELETED_CONTENT;

function isApiError(err: unknown): err is { response?: { data?: { detail?: string } }, message?: string } {
    return typeof err === "object" && err !== null;
}

interface RoomMessagesOptions {
    onRoomDeleted?: () => void;
}

export const useRoomMessages = (roomId: string, options: RoomMessagesOptions = {}) => {
    const [state, dispatch] = useReducer(messageReducer, initialState)
    const { user } = useAuthStore();
    const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const onRoomDeletedRef = useRef(options.onRoomDeleted);
    useEffect(() => {
        onRoomDeletedRef.current = options.onRoomDeleted;
    }, [options.onRoomDeleted]);
    const clearPendingTimer = useCallback((tempId: string) => {
        const timer = pendingTimers.current.get(tempId);
        if (timer !== undefined) clearTimeout(timer);
        pendingTimers.current.delete(tempId);
    }, []);

    useEffect(() => {
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

    // Effect for loading 50 most recent messages (from cache or API)
    useEffect(() => {
        const loadMessages = async () => {
            if (!roomId) return;

            // A cache filled before the last reconnect may miss messages sent while disconnected.
            const cached = sessionCache.get(roomId);
            if (cached && cached.lastLoaded >= getLastReconnectAt()) {
                dispatch({
                    type: "FETCH_SUCCESS",
                    payload: { messages: cached.messages, hasMore: cached.hasMoreMessages, userId: user?.id }
                })
                return;
            }

            try {
                const res = await messageApi.get50RecentMessages(roomId);
                if (!res.success) throw new Error(res.message || "Failed to load messages");

                const data = Array.isArray(res.data) ? res.data : [];
                const unique = deduplicateMessages(data).reverse();
                const hasMore = data.length === 50;
                dispatch({ type: "FETCH_SUCCESS", payload: { messages: unique, hasMore, userId: user?.id } });
                sessionCache.set(roomId, { messages: unique, hasMoreMessages: hasMore, lastLoaded: Date.now() });
            } catch (err: unknown) {
                let msg = "Failed to load messages";
                if (isApiError(err)) {
                    msg = err?.response?.data?.detail || err.message || "Failed to load messages";
                }
                dispatch({ type: "FETCH_ERROR", payload: msg });
            }
        };

        loadMessages();
    }, [roomId, user?.id, getLastReconnectAt]);

    // Resync after a reconnect: refetch the latest page and merge it by message id.
    useEffect(() => {
        if (!roomId) return;
        let active = true;
        const removeListener = onReconnect(() => {
            void (async () => {
                try {
                    const res = await messageApi.get50RecentMessages(roomId);
                    if (!active || !res.success || !Array.isArray(res.data)) return;
                    const latest = deduplicateMessages(res.data).reverse();
                    dispatch({ type: "RESYNC", payload: { messages: latest, userId: user?.id } });
                    const cached = sessionCache.get(roomId);
                    sessionCache.set(roomId, {
                        messages: mergeResyncedMessages(cached?.messages ?? [], latest),
                        hasMoreMessages: cached?.hasMoreMessages ?? latest.length === 50,
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
    }, [roomId, user?.id, onReconnect]);

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
                dispatch({ type: "FAIL_SENT_MESSAGE", payload: { tempId: error.tempId, error: error.message } });
            }
        };
        const removeErrorHandler = subscribeErrors(handleError);
        const unsubscribeRoom = subscribeRoom(roomId, handleNewMessage);
        return () => {
            unsubscribeRoom();
            removeErrorHandler();
        };
    }, [roomId, subscribeRoom, user?.id, subscribeErrors, clearPendingTimer]);

    // Action for sending a message
    const sendMessage = useCallback(async (content: string) => {
        if (!connected || !content.trim() || !user) return;

        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticMessage: Message = {
            id: `optimistic-${tempId}`,
            tempId,
            chatRoomId: roomId,
            senderId: user.id,
            senderName: user.name,
            content: content.trim(),
            type: MessageType.TEXT,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isOwn: true,
            status: "sending",
            isOptimistic: true,
            isDeleted: false,
            isUpdated: false,
        };

        dispatch({ type: "ADD_OPTIMISTIC_MESSAGE", payload: optimisticMessage });

        pendingTimers.current.set(tempId, setTimeout(() => {
            pendingTimers.current.delete(tempId);
            dispatch({ type: "FAIL_SENT_MESSAGE", payload: { tempId, error: "Message confirmation timed out" } });
        }, 10_000));

        let published: boolean;
        try {
            published = sendWebSocketMessage(roomId, content.trim(), tempId);
        } catch {
            published = false;
        }
        if (published === false) {
            clearPendingTimer(tempId);
            dispatch({ type: "FAIL_SENT_MESSAGE", payload: { tempId, error: "Failed to send" } });
        }
    }, [connected, roomId, user, sendWebSocketMessage, clearPendingTimer]);

    return {
        ...state,
        connected,
        connecting,
        sendMessage,
    };
};
