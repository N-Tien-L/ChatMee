import type { IFrame, IMessage, StompHeaders, StompSubscription } from "@stomp/stompjs";

/**
 * One STOMP connection for the whole app, without React.
 *
 * - Subscriptions live in a registry keyed by destination, so they survive reconnects: every
 *   onConnect re-subscribes each destination that still has handlers.
 * - `/user/queue/errors` is subscribed once and dispatched to the error handlers registered
 *   when an error arrives.
 * - Reconnection is driven here (the client's own reconnectDelay is 0) with a capped
 *   exponential backoff plus jitter, and every attempt fetches a fresh single-use ws-token.
 *   A WsUnauthorizedError from the token request stops the session instead (no retries).
 * - SUBSCRIBE frames carry a receipt id. Spring echoes it as `receipt-id` on the ERROR frame of a
 *   denied SUBSCRIBE, so that destination is not re-subscribed on the next connect (a denied
 *   SUBSCRIBE closes the whole connection).
 */

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

export interface StompError {
    tempId?: string;
    /** ErrorCode name from the server (e.g. RATE_LIMITED, VALIDATION_FAILED). */
    code?: string;
    message: string;
}

export type MessageHandler = (message: IMessage) => void;

/** The subset of the @stomp/stompjs Client used by the session. */
export interface StompClientLike {
    readonly connected: boolean;
    readonly active: boolean;
    connectHeaders: StompHeaders;
    activate(): void;
    deactivate(): Promise<void>;
    publish(params: { destination: string; body: string }): void;
    subscribe(destination: string, callback: MessageHandler, headers?: StompHeaders): StompSubscription;
}

export interface StompClientCallbacks {
    beforeConnect: () => Promise<void>;
    onConnect: () => void;
    onStompError: (frame: IFrame) => void;
    onWebSocketClose: () => void;
}

/** Creates a client that does not reconnect on its own and reports through the callbacks. */
export type StompClientFactory = (callbacks: StompClientCallbacks) => StompClientLike;

/**
 * Thrown by getToken when the server rejects the ws-token request with HTTP 401. The session is then
 * over: retrying cannot succeed until the person signs in again.
 */
export class WsUnauthorizedError extends Error {
    constructor() {
        super("WebSocket authentication was rejected");
        this.name = "WsUnauthorizedError";
    }
}

export interface StompSessionOptions {
    clientFactory: StompClientFactory;
    getToken: () => Promise<string>;
    initialRetryDelayMs?: number;
    maxRetryDelayMs?: number;
    /** A connection must stay up this long before the backoff resets. */
    stableAfterMs?: number;
    /** Consecutive failed attempts after which the status becomes "disconnected". */
    disconnectedAfterFailures?: number;
    /** Random source for the reconnect jitter, in [0, 1). Defaults to Math.random. */
    random?: () => number;
    /** Called once when the session stops because the token request was rejected (WsUnauthorizedError). */
    onUnauthorized?: () => void;
}

export interface StompSession {
    start(): void;
    stop(): void;
    getStatus(): ConnectionStatus;
    onStatus(listener: () => void): () => void;
    subscribe(destination: string, handler: MessageHandler): () => void;
    publish(destination: string, body: unknown): boolean;
    onError(handler: (error: StompError) => void): () => void;
    onConnected(listener: (info: { reconnected: boolean }) => void): () => void;
    onSubscriptionDenied(listener: (destination: string) => void): () => void;
    /** Time of the last reconnect (not the first connect), or 0. */
    getLastReconnectAt(): number;
}

export const ERROR_QUEUE = "/user/queue/errors";
const TOKEN_HEADER = "X-WS-Token";

function isStompError(value: unknown): value is StompError {
    return typeof value === "object" && value !== null
        && typeof (value as { message?: unknown }).message === "string";
}

export function createStompSession(options: StompSessionOptions): StompSession {
    const initialDelay = options.initialRetryDelayMs ?? 1_000;
    const maxDelay = options.maxRetryDelayMs ?? 30_000;
    const stableAfter = options.stableAfterMs ?? 10_000;
    const disconnectedAfter = options.disconnectedAfterFailures ?? 3;
    const random = options.random ?? Math.random;

    // Handler entries are objects so the same function can be registered twice independently.
    const registry = new Map<string, Set<{ handler: MessageHandler }>>();
    const wireSubscriptions = new Map<string, StompSubscription>();
    const pendingReceipts = new Map<string, string>();
    const denied = new Set<string>();
    const statusListeners = new Set<() => void>();
    const errorHandlers = new Set<(error: StompError) => void>();
    const connectedListeners = new Set<(info: { reconnected: boolean }) => void>();
    const deniedListeners = new Set<(destination: string) => void>();

    let client: StompClientLike | null = null;
    let status: ConnectionStatus = "idle";
    let failures = 0;
    let hasConnected = false;
    let lastReconnectAt = 0;
    let receiptSequence = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stableTimer: ReturnType<typeof setTimeout> | null = null;

    const setStatus = (next: ConnectionStatus) => {
        if (status === next) return;
        status = next;
        [...statusListeners].forEach(listener => listener());
    };

    const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
        if (timer !== null) clearTimeout(timer);
        return null;
    };

    const dispatch = (destination: string, message: IMessage) => {
        const entries = registry.get(destination);
        if (!entries) return;
        [...entries].forEach(entry => entry.handler(message));
    };

    const wireSubscribe = (target: StompClientLike, destination: string) => {
        const receipt = `sub-${++receiptSequence}`;
        pendingReceipts.set(receipt, destination);
        wireSubscriptions.set(destination,
            target.subscribe(destination, message => dispatch(destination, message), { receipt }));
    };

    const scheduleReconnect = (target: StompClientLike) => {
        if (client !== target || retryTimer !== null) return;
        stableTimer = clearTimer(stableTimer);
        wireSubscriptions.clear();
        failures += 1;
        if (failures >= disconnectedAfter) setStatus("disconnected");
        else setStatus(hasConnected ? "reconnecting" : "connecting");
        // Equal jitter: between half and all of the capped backoff, so clients that lost the server
        // together do not all retry at the same moment (SPEC-008 AC-008-14).
        const capped = Math.min(maxDelay, initialDelay * 2 ** (failures - 1));
        const delay = capped / 2 + (random() * capped) / 2;
        void target.deactivate();
        retryTimer = setTimeout(() => {
            retryTimer = null;
            if (client === target) target.activate();
        }, delay);
    };

    const stopSession = () => {
        retryTimer = clearTimer(retryTimer);
        stableTimer = clearTimer(stableTimer);
        const current = client;
        client = null;
        wireSubscriptions.clear();
        pendingReceipts.clear();
        setStatus("idle");
        if (current) void current.deactivate();
    };

    const createClient = () => {
        const created: StompClientLike = options.clientFactory({
            beforeConnect: async () => {
                // A fresh single-use token is required for every connection attempt.
                created.connectHeaders = {};
                try {
                    const token = await options.getToken();
                    if (client !== created || !created.active) return;
                    created.connectHeaders = { [TOKEN_HEADER]: token };
                } catch (error) {
                    if (error instanceof WsUnauthorizedError) {
                        // Rejected by the server: stop instead of retrying forever (AC-008-14).
                        if (client === created) {
                            stopSession();
                            options.onUnauthorized?.();
                        }
                        return;
                    }
                    scheduleReconnect(created);
                }
            },
            onConnect: () => {
                if (client !== created) return;
                const reconnected = hasConnected;
                hasConnected = true;
                if (reconnected) lastReconnectAt = Date.now();
                // Reset the backoff only once the connection proved stable, so a server that accepts
                // CONNECT and then answers with ERROR cannot cause a tight reconnect loop.
                stableTimer = clearTimer(stableTimer);
                stableTimer = setTimeout(() => {
                    stableTimer = null;
                    failures = 0;
                }, stableAfter);
                wireSubscriptions.clear();
                pendingReceipts.clear();
                registry.forEach((_entries, destination) => {
                    if (!denied.has(destination)) wireSubscribe(created, destination);
                });
                setStatus("connected");
                [...connectedListeners].forEach(listener => listener({ reconnected }));
            },
            onStompError: frame => {
                if (client !== created) return;
                const receiptId = frame.headers["receipt-id"];
                const destination = receiptId ? pendingReceipts.get(receiptId) : undefined;
                if (destination !== undefined && registry.has(destination)) {
                    denied.add(destination);
                    [...deniedListeners].forEach(listener => listener(destination));
                }
                scheduleReconnect(created);
            },
            onWebSocketClose: () => {
                // Closes caused by our own deactivate() arrive while the client is not active.
                if (client !== created || !created.active) return;
                scheduleReconnect(created);
            },
        });
        return created;
    };

    const subscribe = (destination: string, handler: MessageHandler) => {
        const entry = { handler };
        let entries = registry.get(destination);
        if (!entries) {
            entries = new Set();
            registry.set(destination, entries);
        }
        entries.add(entry);
        if (client?.connected && !wireSubscriptions.has(destination) && !denied.has(destination)) {
            wireSubscribe(client, destination);
        }
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            const current = registry.get(destination);
            if (!current) return;
            current.delete(entry);
            if (current.size > 0) return;
            registry.delete(destination);
            denied.delete(destination);
            // Look the subscription up now: it may have been replaced by a reconnect.
            const subscription = wireSubscriptions.get(destination);
            wireSubscriptions.delete(destination);
            if (subscription && client?.connected) subscription.unsubscribe();
        };
    };

    // Subscribed for the whole session; dispatches to the handlers registered at delivery time.
    subscribe(ERROR_QUEUE, message => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(message.body);
        } catch {
            return;
        }
        if (!isStompError(parsed)) return;
        const error = parsed;
        [...errorHandlers].forEach(handler => handler(error));
    });

    const addListener = <T>(set: Set<T>, listener: T) => {
        set.add(listener);
        return () => {
            set.delete(listener);
        };
    };

    return {
        start() {
            if (client) return;
            failures = 0;
            setStatus("connecting");
            client = createClient();
            client.activate();
        },
        stop: stopSession,
        getStatus: () => status,
        onStatus: listener => addListener(statusListeners, listener),
        subscribe,
        publish(destination, body) {
            if (!client?.connected) return false;
            client.publish({ destination, body: JSON.stringify(body) });
            return true;
        },
        onError: handler => addListener(errorHandlers, handler),
        onConnected: listener => addListener(connectedListeners, listener),
        onSubscriptionDenied: listener => addListener(deniedListeners, listener),
        getLastReconnectAt: () => lastReconnectAt,
    };
}
