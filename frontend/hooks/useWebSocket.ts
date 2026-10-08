import { useCallback, useEffect, useRef, useState } from "react"
import { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import { useAuthStore, useUsersStore } from "@/lib/stores"
import SockJS from "sockjs-client"
import { authApi } from "@/lib/api/authApi"

import { PresenceMessage, TypingMessage, useChatStore } from "@/lib/stores/chatStore"
import { Message } from "@/lib/types"

export interface WebSocketState {
    connected: boolean
    connecting: boolean
    error: string | null
}

export interface StompError {
    tempId: string;
    message: string;
}

export const useWebSocket = () => {
    // state management
    const [state, setState] = useState<WebSocketState>({
        connected: false,
        connecting: false,
        error: null
    })

    // Refs for STOMP client and subscriptions
    const clientRef = useRef<Client | null>(null)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const subsRef = useRef<Map<string, StompSubscription>>(new Map());

    // Get auth state
    const { isAuthenticated, user } = useAuthStore()

    // Get chat state and actions
    const { updatePresence, updateTyping } = useChatStore();

    const subscribe = useCallback(
        (dest: string, handler: (msg: IMessage) => void) => {
            const client = clientRef.current;
            if (!client?.connected) return;
            if (subsRef.current.has(dest)) return;

            const sub = client.subscribe(dest, handler);
            subsRef.current.set(dest, sub);
        },
        []
    );

    const unsubscribe = useCallback((dest: string) => {
        const sub = subsRef.current.get(dest);
        if (sub) {
            sub.unsubscribe();
            subsRef.current.delete(dest);
        }
    }, []);

    const subscribePresence = useCallback(() => {
        subscribe("/topic/presence", (msg) => {
            try {
                const data: PresenceMessage = JSON.parse(msg.body);
                updatePresence(data);
            } catch (err) {
                console.error("Presence parse error:", err);
            }
        });
    }, [subscribe, updatePresence]);

    const subscribeTyping = useCallback(
        (roomId: string) => {
            subscribe(`/topic/typing/${roomId}`, async (msg) => {
                try {
                    const data: TypingMessage = JSON.parse(msg.body);
                    if (data.userId === user?.id) return;

                    const userCache = useUsersStore.getState().getUserFromCache(data.userId);
                    if (!userCache)
                        await useUsersStore.getState().fetchUserById(data.userId);

                    updateTyping(data);
                } catch (err) {
                    console.error("Typing parse error:", err);
                }
            });
        },
        [subscribe, updateTyping, user?.id]
    );

    const subscribeRoom = useCallback(
        (roomId: string, onMessage: (msg: Message) => void) => {
            subscribe(`/topic/public/${roomId}`, (msg) => {
                try {
                    const message: Message = JSON.parse(msg.body);
                    message.isOwn = message.senderId === user?.id;
                    onMessage(message);
                } catch (err) {
                    console.error("Room message parse error:", err);
                }
            });
        },
        [subscribe, user?.id]
    );

    const subscribeErrors = useCallback(
        (onError: (e: StompError) => void) => {
            subscribe("/user/queue/errors", (msg) => {
                try {
                    const err: StompError = JSON.parse(msg.body);
                    onError(err);
                } catch (error) {
                    console.error("Error queue parse error:", error);
                }
            });
        },
        [subscribe]
    );

    /** ==============================
    *             SENDERS
    *  ============================== */

    const sendPresence = useCallback(
        (online: boolean) => {
            if (!clientRef.current?.connected || !user?.id) return;
            clientRef.current.publish({
                destination: "/app/presence",
                body: JSON.stringify({ online }),
            });
        },
        [user?.id]
    );

    const connect = useCallback(() => {
        if (!isAuthenticated || clientRef.current) return;

        setState(prev => ({ ...prev, connecting: true, error: null }));
        const client = new Client({
            webSocketFactory: () => new SockJS(
                process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws'
            ),
            reconnectDelay: 5000,
            beforeConnect: async () => {
                // A fresh single-use token is required for every connection attempt.
                client.connectHeaders = {};
                setState(prev => ({ ...prev, connecting: true, error: null }));
                try {
                    const token = await authApi.getWsToken();
                    if (clientRef.current !== client || !client.active) return;
                    client.connectHeaders = { 'X-WS-Token': token };
                } catch {
                    if (clientRef.current !== client) return;
                    setState({ connected: false, connecting: false, error: 'Unable to authenticate WebSocket connection' });
                    // beforeConnect failures do not trigger stompjs reconnect automatically.
                    void client.deactivate().then(() => {
                        if (clientRef.current !== client) return;
                        retryTimerRef.current = setTimeout(() => {
                            retryTimerRef.current = null;
                            if (clientRef.current === client) client.activate();
                        }, client.reconnectDelay);
                    });
                }
            },
            onConnect: () => {
                setState({ connected: true, connecting: false, error: null });
                subsRef.current.clear();
                subscribePresence();
                if (user?.id) sendPresence(true);
            },
            onStompError: () => {
                setState({ connected: false, connecting: false, error: 'WebSocket connection rejected' });
            },
            onWebSocketClose: () => {
                setState(prev => ({ ...prev, connected: false, connecting: false }));
            }
        });
        clientRef.current = client;
        client.activate();
    }, [isAuthenticated, user?.id, sendPresence, subscribePresence]);

    const disconnect = useCallback(() => {
        if (retryTimerRef.current !== null) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
        const client = clientRef.current;
        if (!client) return;
        sendPresence(false);
        if (client.connected) subsRef.current.forEach(sub => sub.unsubscribe());
        subsRef.current.clear();
        clientRef.current = null;
        void client.deactivate();
        setState({ connected: false, connecting: false, error: null });
    }, [sendPresence]);

    useEffect(() => {
        if (isAuthenticated) connect();
        else disconnect();
        return () => disconnect();
    }, [isAuthenticated, connect, disconnect]);

    useEffect(() => {
        const handleBeforeUnload = () => sendPresence(false);
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [sendPresence]);

    useEffect(() => {
        if (!state.connected || !user?.id) return;
        const id = setInterval(() => sendPresence(true), 30000);
        return () => clearInterval(id);
    }, [state.connected, user?.id, sendPresence]);

    const sendTyping = useCallback(
        (roomId: string, typing: boolean) => {
            if (!clientRef.current?.connected || !user?.id) return;
            clientRef.current.publish({
                destination: "/app/typing",
                body: JSON.stringify({ roomId, typing }),
            });
        },
        [user?.id]
    );

    const sendMessage = useCallback(
        (roomId: string, content: string, tempId?: string) => {
            if (!clientRef.current?.connected || !user) return;
            const message = {
                roomId,
                content,
                messageType: "TEXT",
                tempId,
            };
            clientRef.current.publish({
                destination: "/app/chat.sendMessage",
                body: JSON.stringify(message),
            });
        },
        [user]
    );

    const joinRoom = useCallback(
        (roomId: string) => {
            if (!clientRef.current?.connected || !user) return;
            const message = {
                roomId,
                messageType: "SYSTEM",
                content: "joined the chat",
                tempId: `join-${Date.now()}`,
            };
            clientRef.current.publish({
                destination: "/app/chat.addUser",
                body: JSON.stringify(message),
            });
        },
        [user]
    );


    /** ==============================
    *             EXPORT
    *  ============================== */
    return {
        ...state,
        connect,
        disconnect,
        subscribeRoom,
        unsubscribe,
        subscribeTyping,
        subscribePresence,
        subscribeErrors,
        sendMessage,
        sendTyping,
        joinRoom,
    }
}

