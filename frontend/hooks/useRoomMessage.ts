import { useCallback, useEffect, useReducer, useState } from "react";
import { StompError, useWebSocket } from "./useWebSocket";
import { messageApi } from "@/lib/api/messageApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { Message, MessageResponse, MessageType } from "@/lib/types";
import {
    addIsOwnToMessages,
    deduplicateMessages,
    updateSessionCache,
} from "@/lib/utils/messageUtils";
import { initialState, messageReducer } from "./reducers/messageReducer";

// Cache messages per room for current session
const sessionCache = new Map<
    string,
    { messages: MessageResponse[]; hasMoreMessages: boolean; lastLoaded: number }
>();

export const useRoomMessages = (roomId: string) => {
    const [state, dispatch] = useReducer(messageReducer, initialState)
    const { user } = useAuthStore();
    const {
        connected,
        connecting,
        error: wsError,
        subscribeRoom,
        unsubscribe,
        sendMessage: sendWebSocketMessage,
        joinRoom,
        subscribeErrors,
    } = useWebSocket();

    // Effect for loading 50 most recent messages (from cache or API)
    useEffect(() => {
        const loadMessages = async () => {
            if (!roomId) return;

            const cached = sessionCache.get(roomId);
            if (cached) {
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
            } catch (err: any) {
                const msg = err?.response?.data?.message || err.message || "Failed to load messages";
                dispatch({ type: "FETCH_ERROR", payload: msg });
            }
        };

        loadMessages();
    }, [roomId, user?.id]);

    // Effect for WebSocket subscriptions
    useEffect(() => {
        if (!roomId || !connected) return;

        // 1. Subscribe to new messages
        const handleNewMessage = (message: Message) => {
            // Check if this message confirms one we sent optimistically
            if (message.tempId && message.senderId === user?.id) {
                dispatch({ type: "CONFIRM_SENT_MESSAGE", payload: message });
            } else {
                dispatch({ type: "RECEIVE_WEBSOCKET_MESSAGE", payload: { message, userId: user?.id } });
            }
            updateSessionCache(sessionCache, roomId, [message]);
        };

        // 2. Subscribe to delivery errors
        const handleError = (error: StompError) => {
            console.error("Message delivery failed:", error);
            if (error.tempId) {
                dispatch({ type: "FAIL_SENT_MESSAGE", payload: { tempId: error.tempId, error: error.message } });
            }
        };
        subscribeErrors(handleError);

        // 3. Join the room logic
        if (!sessionCache.has(roomId)) {
            joinRoom(roomId);
        }

        subscribeRoom(roomId, handleNewMessage);
        return () => unsubscribe(roomId);
    }, [roomId, connected, subscribeRoom, unsubscribe, user?.id]);

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

        try {
            sendWebSocketMessage(roomId, content.trim(), tempId);
        } catch (err) {
            console.error("Send message failed:", err);
            dispatch({ type: "FAIL_SENT_MESSAGE", payload: { tempId, error: "Failed to send" } });
        }
    }, [connected, roomId, user, sendWebSocketMessage]);

    return {
        ...state,
        connected,
        connecting,
        wsError,
        sendMessage,
    };
};
