"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { authApi } from "@/lib/api/authApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { PresenceMessage, useChatStore } from "@/lib/stores/chatStore";
import { createStompClientFactory } from "./stompClient";
import { ConnectionStatus, createStompSession, StompSession } from "./stompSession";

const PRESENCE_TOPIC = "/topic/presence";
const PRESENCE_INTERVAL_MS = 30_000;
const ROOM_TOPIC_PREFIXES = ["/topic/rooms/"];

const StompContext = createContext<StompSession | null>(null);

/** Owns the app's single STOMP session; mount once around the authenticated area. */
export function StompProvider({ children }: { children: ReactNode }) {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const userId = useAuthStore(state => state.user?.id);
    const [session] = useState(() => createStompSession({
        clientFactory: createStompClientFactory(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080/ws"),
        getToken: authApi.getWsToken,
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
