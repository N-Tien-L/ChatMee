import { useCallback, useEffect, useRef, useState } from "react"
import { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import { useAuthStore, useUsersStore } from "@/lib/stores"
import SockJS from "sockjs-client"

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
    const subsRef = useRef<Map<string, StompSubscription>>(new Map());

    // Get auth state
    const { isAuthenticated, user } = useAuthStore()

    // Get chat state and actions
    const { updatePresence, updateTyping } = useChatStore();

    /** ==============================
    *        CONNECTION HANDLING
    *  ============================== */

    const connect = useCallback(() => {
        if (!isAuthenticated || clientRef.current?.connected) return

        setState(prev => ({ ...prev, connecting: true, error: null }))

        const client = new Client({
            webSocketFactory: () => new SockJS(
                process.env.NEXT_PUBLIC_WS_URL ||
                (process.env.NODE_ENV === 'production'
                    ? 'https://chatmee-wxvk.onrender.com/ws'
                    : 'http://localhost:8080/ws')
            ),
            connectHeaders: {
                userId: user?.id ?? ""
            },
            debug: (str) => console.log('[STOMP]', str),
            onConnect: () => {
                setState(prev => ({ ...prev, connected: true, connecting: false }))
                console.log("✅ WebSocket connected for user:", user?.id);
                console.log("Subscribing to presence after connection...")
                subscribePresence();

                if (user?.id) {
                    sendPresence(true); // announce online
                }
            },
            onStompError: (frame) => {
                console.log("STOMP error:", frame)
                setState(prev => ({
                    ...prev,
                    connected: false,
                    connecting: false,
                    error: frame.headers['message']
                }))
            },
            onWebSocketClose: () => {
                console.warn("⚠️ WebSocket closed");
                setState({ connected: false, connecting: false, error: null });
                sendPresence(false); // fallback offline notice
            }
        })

        clientRef.current = client
        client.activate()
    }, [isAuthenticated, user])

    const disconnect = useCallback(() => {
        const client = clientRef.current;
        if (!client) return;

        sendPresence(false);
        subsRef.current.forEach((s) => s.unsubscribe());
        subsRef.current.clear();

        client.deactivate();
        clientRef.current = null;
        setState({ connected: false, connecting: false, error: null });
    }, [user])

    /** ==============================
    *       AUTO CONNECT / CLEANUP
    *  ============================== */

    useEffect(() => {
        if (isAuthenticated) {
            connect()
        } else {
            disconnect()
        }
    }, [isAuthenticated, connect, disconnect])

    useEffect(() => {
        window.addEventListener("beforeunload", () => sendPresence(false));
        return () => disconnect();
    }, [disconnect]);

    /** ==============================
    *       HEARTBEAT (PRESENCE)
    *  ============================== */

    useEffect(() => {
        if (!state.connected || !user?.id) return;
        const id = setInterval(() => sendPresence(true), 30000);
        return () => clearInterval(id);
    }, [state.connected, user?.id]);

    /** ==============================
    *          SUBSCRIPTIONS
    *  ============================== */

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
                body: JSON.stringify({ userId: user.id, online }),
            });
        },
        [user?.id]
    );

    const sendTyping = useCallback(
        (roomId: string, typing: boolean) => {
            if (!clientRef.current?.connected || !user?.id) return;
            clientRef.current.publish({
                destination: "/app/typing",
                body: JSON.stringify({ roomId, userId: user.id, typing }),
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
                senderId: user.id,  // Add userId
                senderName: user.name,
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
                senderId: user.id,  // Add userId
                senderName: user.name,
                content: "",
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

