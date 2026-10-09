import { Client } from "@stomp/stompjs";
import type { StompClientFactory } from "./stompSession";

/**
 * Maps the configured endpoint URL to a WebSocket URL: http -> ws, https -> wss,
 * ws/wss unchanged. Keeps NEXT_PUBLIC_WS_URL values written for SockJS valid.
 */
export function toWebSocketUrl(url: string): string {
    if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`;
    if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
    return url;
}

/** A plain WebSocket STOMP client; reconnection is left to the session (reconnectDelay 0). */
export function createStompClientFactory(url: string): StompClientFactory {
    const brokerURL = toWebSocketUrl(url);
    return callbacks => new Client({
        brokerURL,
        reconnectDelay: 0,
        beforeConnect: callbacks.beforeConnect,
        onConnect: callbacks.onConnect,
        onStompError: callbacks.onStompError,
        onWebSocketClose: callbacks.onWebSocketClose,
    });
}
