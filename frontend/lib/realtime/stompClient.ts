import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import type { StompClientFactory } from "./stompSession";

/** A SockJS-backed STOMP client; reconnection is left to the session (reconnectDelay 0). */
export function createSockJsClientFactory(url: string): StompClientFactory {
    return callbacks => new Client({
        webSocketFactory: () => new SockJS(url),
        reconnectDelay: 0,
        beforeConnect: callbacks.beforeConnect,
        onConnect: callbacks.onConnect,
        onStompError: callbacks.onStompError,
        onWebSocketClose: callbacks.onWebSocketClose,
    });
}
