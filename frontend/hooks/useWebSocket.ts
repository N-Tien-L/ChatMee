import { useCallback } from "react"
import { useAuthStore, useUsersStore } from "@/lib/stores"
import { TypingMessage, useChatStore } from "@/lib/stores/chatStore"
import { useConnectionStatus, useStompSession } from "@/lib/realtime/StompProvider"
import type { StompError } from "@/lib/realtime/stompSession"
import { Message, ReactionUpdatedEvent } from "@/lib/types"
import { isReactionEvent } from "@/lib/utils/reactions"

export type { StompError }

/** Room-level helpers over the app's single STOMP session (see StompProvider). */
export const useWebSocket = () => {
    const session = useStompSession();
    const status = useConnectionStatus();

    // Message frames have no `event` field; event frames (REACTION_UPDATED, SPEC-015) do. Unknown events are ignored
    // so a newer server never shows them as messages.
    const subscribeRoom = useCallback(
        (roomId: string, onMessage: (msg: Message) => void, onReaction?: (event: ReactionUpdatedEvent) => void) =>
            session.subscribe(`/topic/rooms/${roomId}`, (frame) => {
                let data: unknown;
                try {
                    data = JSON.parse(frame.body);
                } catch {
                    return;
                }
                if (typeof data !== "object" || data === null) return;
                if ("event" in data) {
                    if (isReactionEvent(data)) onReaction?.(data);
                    return;
                }
                onMessage(data as Message);
            }),
        [session]
    );

    const subscribeTyping = useCallback(
        (roomId: string) =>
            session.subscribe(`/topic/rooms/${roomId}/typing`, async (frame) => {
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
        (roomId: string, typing: boolean) => session.publish(`/app/rooms/${roomId}/typing`, { typing }),
        [session]
    );

    // Clients send TEXT only; SYSTEM messages come from the server.
    const sendMessage = useCallback(
        (roomId: string, content: string, tempId?: string, replyToMessageId?: string) =>
            session.publish("/app/chat.sendMessage", replyToMessageId
                ? { roomId, content, messageType: "TEXT", tempId, replyToMessageId }
                : { roomId, content, messageType: "TEXT", tempId }),
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
