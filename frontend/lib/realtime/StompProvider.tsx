"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { authApi } from "@/lib/api/authApi";
import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { PresenceMessage, useChatStore } from "@/lib/stores/chatStore";
import { createStompClientFactory } from "./stompClient";
import { ConnectionStatus, createStompSession, EVENTS_QUEUE, StompSession, WsUnauthorizedError } from "./stompSession";

const PRESENCE_TOPIC = "/topic/presence";
const PRESENCE_INTERVAL_MS = 30_000;
const ROOM_TOPIC_PREFIXES = ["/topic/rooms/"];

const StompContext = createContext<StompSession | null>(null);

/**
 * Fetches a ws-token. The API client turns an HTTP 401 into an Error whose cause is the axios error,
 * so the rejection is mapped to WsUnauthorizedError, which stops the session instead of retrying.
 */
async function fetchWsToken(): Promise<string> {
    try {
        return await authApi.getWsToken();
    } catch (error) {
        const cause = error instanceof Error ? error.cause : undefined;
        if (axios.isAxiosError(cause) && cause.response?.status === 401) {
            throw new WsUnauthorizedError();
        }
        throw error;
    }
}

/** Owns the app's single STOMP session; mount once around the authenticated area. */
export function StompProvider({ children }: { children: ReactNode }) {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const userId = useAuthStore(state => state.user?.id);
    const [session] = useState(() => createStompSession({
        clientFactory: createStompClientFactory(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080/ws"),
        getToken: fetchWsToken,
        onUnauthorized: () => window.location.replace("/login?reason=expired"),
    }));

    useEffect(() => {
        if (!isAuthenticated) return;
        session.start();
        return () => {
            session.publish("/app/presence", { online: false });
            session.stop();
        };
    }, [isAuthenticated, session]);

    useEffect(() => session.subscribe(PRESENCE_TOPIC, message => {
        try {
            const data: PresenceMessage = JSON.parse(message.body);
            useChatStore.getState().updatePresence(data);
        } catch {
            // Ignore malformed presence frames.
        }
    }), [session]);

    useEffect(() => {
        if (!userId) return;
        const report = () => session.publish("/app/presence", { online: true });
        const removeListener = session.onConnected(report);
        report();
        const interval = setInterval(report, PRESENCE_INTERVAL_MS);
        return () => {
            removeListener();
            clearInterval(interval);
        };
    }, [session, userId]);

    // Room lifecycle and activity events for this user. The session keeps the subscription across
    // reconnects, so it is registered once per provider.
    useEffect(() => session.subscribe(EVENTS_QUEUE, message => {
        let event: unknown;
        try {
            event = JSON.parse(message.body);
        } catch {
            return; // Ignore malformed event frames.
        }
        void useChatRoomsStore.getState().handleUserEvent(event);
    }), [session]);

    // Events are not replayed, so every connect (first and reconnect) refetches the room list and
    // the presence snapshot.
    useEffect(() => {
        if (!userId) return;
        const refetch = () => {
            void useChatRoomsStore.getState().fetchRooms();
            chatRoomApi.getOnlineUsers()
                .then(users => useChatStore.getState().setOnlineUsers(users))
                .catch(() => {
                    // Presence dots stay as they were; the next connect retries.
                });
        };
        return session.onConnected(refetch);
    }, [session, userId]);

    // A denied room SUBSCRIBE means the membership is gone: refresh the room list so the room view
    // unmounts and releases its subscriptions.
    useEffect(() => session.onSubscriptionDenied(destination => {
        if (ROOM_TOPIC_PREFIXES.some(prefix => destination.startsWith(prefix))) {
            void useChatRoomsStore.getState().fetchRooms();
        }
    }), [session]);

    return <StompContext.Provider value={session}>{children}</StompContext.Provider>;
}

export function useStompSession(): StompSession {
    const session = useContext(StompContext);
    if (!session) throw new Error("useStompSession must be used inside StompProvider");
    return session;
}

const serverStatus = (): ConnectionStatus => "idle";

export function useConnectionStatus(): ConnectionStatus {
    const session = useStompSession();
    return useSyncExternalStore(session.onStatus, session.getStatus, serverStatus);
}
