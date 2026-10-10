import { useCallback } from "react"
import { useAuthStore, useUsersStore } from "@/lib/stores"
import { TypingMessage, useChatStore } from "@/lib/stores/chatStore"
import { useConnectionStatus, useStompSession } from "@/lib/realtime/StompProvider"
import type { StompError } from "@/lib/realtime/stompSession"
import { Message } from "@/lib/types"

export type { StompError }

/** Room-level helpers over the app's single STOMP session (see StompProvider). */
export const useWebSocket = () => {
    const session = useStompSession();
    const status = useConnectionStatus();

    const subscribeRoom = useCallback(
        (roomId: string, onMessage: (msg: Message) => void) =>
            session.subscribe(`/topic/public/${roomId}`, (frame) => {
                let message: Message;
                try {
                    message = JSON.parse(frame.body);
                } catch {
                    return;
                }
                onMessage(message);
            }),
        [session]
    );

    const subscribeTyping = useCallback(
        (roomId: string) =>
            session.subscribe(`/topic/typing/${roomId}`, async (frame) => {
                let data: TypingMessage;
                try {
                    data = JSON.parse(frame.body);
                } catch {
                    return;
                }
                if (data.userId === useAuthStore.getState().user?.id) return;
                const users = useUsersStore.getState();
                if (!users.getUserFromCache(data.userId)) {
                    try {
                        await users.fetchUserById(data.userId);
                    } catch {
                        // The indicator falls back to "Someone" without a cached name.
                    }
                }
                useChatStore.getState().updateTyping(data);
            }),
        [session]
    );

    const onReconnect = useCallback(
        (listener: () => void) => session.onConnected(({ reconnected }) => {
            if (reconnected) listener();
        }),
        [session]
    );

    const sendTyping = useCallback(
        (roomId: string, typing: boolean) => session.publish("/app/typing", { roomId, typing }),
        [session]
    );

    // Clients send TEXT only; SYSTEM messages come from the server.
    const sendMessage = useCallback(
        (roomId: string, content: string, tempId?: string) =>
            session.publish("/app/chat.sendMessage", { roomId, content, messageType: "TEXT", tempId }),
        [session]
    );

    return {
        status,
        connected: status === "connected",
        connecting: status === "connecting" || status === "reconnecting",
        subscribeRoom,
        subscribeTyping,
        subscribeErrors: session.onError,
        onReconnect,
        getLastReconnectAt: session.getLastReconnectAt,
        sendMessage,
        sendTyping,
    }
}
