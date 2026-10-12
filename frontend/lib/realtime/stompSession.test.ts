import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IFrame, IMessage, StompHeaders, StompSubscription } from "@stomp/stompjs";
import {
    createStompSession,
    ERROR_QUEUE,
    MessageHandler,
    StompClientCallbacks,
    StompClientLike,
    StompSessionOptions,
    WsUnauthorizedError,
} from "./stompSession";

interface FakeSubscription {
    destination: string;
    callback: MessageHandler;
    headers: StompHeaders;
    generation: number;
    unsubscribe: ReturnType<typeof vi.fn>;
}

/** Mimics the parts of the stompjs Client the session relies on. */
class FakeClient implements StompClientLike {
    connected = false;
    active = false;
    connectHeaders: StompHeaders = {};
    generation = 0;
    subscriptions: FakeSubscription[] = [];
    activate = vi.fn(() => { this.active = true; });
    deactivate = vi.fn(async () => {
        this.active = false;
        this.connected = false;
    });
    publish = vi.fn();

    constructor(private readonly callbacks: StompClientCallbacks) {}

    subscribe(destination: string, callback: MessageHandler, headers: StompHeaders = {}) {
        const subscription = { destination, callback, headers, generation: this.generation, unsubscribe: vi.fn() };
        this.subscriptions.push(subscription);
        return { id: `${this.subscriptions.length}`, unsubscribe: subscription.unsubscribe } as unknown as StompSubscription;
    }

    async connect() {
        await this.callbacks.beforeConnect();
        // Like stompjs: a client deactivated during beforeConnect does not connect.
        if (!this.active) return;
        this.generation += 1;
        this.connected = true;
        this.callbacks.onConnect();
    }

    drop() {
        this.connected = false;
        this.callbacks.onWebSocketClose();
    }

    error(headers: StompHeaders = {}) {
        this.callbacks.onStompError({ headers } as unknown as IFrame);
    }

    live(destination: string) {
        return this.subscriptions.filter(s => s.destination === destination && s.generation === this.generation);
    }

    deliver(destination: string, body: unknown) {
        this.live(destination)
            .filter(s => s.unsubscribe.mock.calls.length === 0)
            .forEach(s => s.callback({ body: JSON.stringify(body) } as IMessage));
    }
}

function setup(overrides: Partial<StompSessionOptions> = {}) {
    const clients: FakeClient[] = [];
    let tokenCount = 0;
    const getToken = vi.fn(async () => `token-${++tokenCount}`);
    const session = createStompSession({
        clientFactory: callbacks => {
            const client = new FakeClient(callbacks);
            clients.push(client);
            return client;
        },
        getToken,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 4000,
        stableAfterMs: 10_000,
        // Full capped delay by default, so the exact backoff expectations below hold; jitter has its own tests.
        random: () => 1,
        ...overrides,
    });
    session.start();
    return { session, client: () => clients[clients.length - 1], clients, getToken };
}

const ROOM = "/topic/rooms/r1";

describe("stompSession", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("re-subscribes every registered destination after a reconnect", async () => {
        const { session, client, clients } = setup();
        const handler = vi.fn();
        session.subscribe(ROOM, handler);
        await client().connect();
        expect(client().live(ROOM)).toHaveLength(1);

        client().drop();
        expect(session.getStatus()).toBe("reconnecting");
        expect(client().activate).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(client().activate).toHaveBeenCalledTimes(2);
        await client().connect();

        expect(clients).toHaveLength(1);
        expect(client().live(ROOM)).toHaveLength(1);
        expect(client().live(ERROR_QUEUE)).toHaveLength(1);
        client().deliver(ROOM, { id: "m1" });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(session.getStatus()).toBe("connected");
    });

    it("stops delivery when unsubscribed after a reconnect", async () => {
        const { session, client } = setup();
        const handler = vi.fn();
        const unsubscribe = session.subscribe(ROOM, handler);
        await client().connect();
        client().drop();
        await vi.advanceTimersByTimeAsync(1000);
        await client().connect();

        unsubscribe();
        const [current] = client().live(ROOM);
        expect(current.unsubscribe).toHaveBeenCalledTimes(1);
        client().deliver(ROOM, { id: "m1" });
        expect(handler).not.toHaveBeenCalled();

        // Second failure before the connection proved stable: the delay doubles.
        client().drop();
        await vi.advanceTimersByTimeAsync(2000);
        await client().connect();
        expect(client().live(ERROR_QUEUE)).toHaveLength(1);
        expect(client().live(ROOM)).toHaveLength(0);
    });

    it("keeps a shared destination subscribed until its last handler leaves", async () => {
        const { session, client } = setup();
        const first = vi.fn();
        const second = vi.fn();
        const removeFirst = session.subscribe(ROOM, first);
        session.subscribe(ROOM, second);
        await client().connect();
        expect(client().live(ROOM)).toHaveLength(1);

        removeFirst();
        removeFirst();
        client().deliver(ROOM, { id: "m1" });
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("dispatches the error queue to the handler registered at delivery time", async () => {
        const { session, client } = setup();
        const stale = vi.fn();
        const removeStale = session.onError(stale);
        await client().connect();
        removeStale();
        const current = vi.fn();
        session.onError(current);

        client().deliver(ERROR_QUEUE, { tempId: "t1", message: "Save failed" });

        expect(stale).not.toHaveBeenCalled();
        expect(current).toHaveBeenCalledWith({ tempId: "t1", message: "Save failed" });
        expect(client().live(ERROR_QUEUE)).toHaveLength(1);
    });

    it("fetches a fresh token for every connection attempt", async () => {
        const { client, getToken } = setup();
        await client().connect();
        expect(client().connectHeaders).toEqual({ "X-WS-Token": "token-1" });

        client().drop();
        await vi.advanceTimersByTimeAsync(1000);
        await client().connect();
        expect(getToken).toHaveBeenCalledTimes(2);
        expect(client().connectHeaders).toEqual({ "X-WS-Token": "token-2" });
    });

    it("retries a failed token fetch with backoff", async () => {
        const getToken = vi.fn()
            .mockRejectedValueOnce(new Error("401"))
            .mockResolvedValue("token-ok");
        const { session, client } = setup({ getToken });
        await client().connect();
        expect(client().deactivate).toHaveBeenCalled();
        expect(session.getStatus()).toBe("connecting");

        await vi.advanceTimersByTimeAsync(1000);
        expect(client().activate).toHaveBeenCalledTimes(2);
        await client().connect();
        expect(client().connectHeaders).toEqual({ "X-WS-Token": "token-ok" });
    });

    it("stops retrying and reports unauthorized when the ws-token is rejected with 401", async () => {
        const onUnauthorized = vi.fn();
        const getToken = vi.fn().mockRejectedValue(new WsUnauthorizedError());
        const { session, client } = setup({ getToken, onUnauthorized });
        await client().connect();
        const activations = client().activate.mock.calls.length;

        await vi.advanceTimersByTimeAsync(60_000);

        expect(getToken).toHaveBeenCalledTimes(1);
        expect(client().activate.mock.calls.length).toBe(activations);
        expect(session.getStatus()).toBe("idle");
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("waits between half and all of the capped delay after a network error (jitter)", async () => {
        const getToken = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        const { client } = setup({ getToken, random: () => 0 });
        await client().connect();
        const before = client().activate.mock.calls.length;

        await vi.advanceTimersByTimeAsync(499);
        expect(client().activate.mock.calls.length).toBe(before);
        await vi.advanceTimersByTimeAsync(1);
        expect(client().activate.mock.calls.length).toBe(before + 1);
    });

    it("never waits longer than the capped delay (jitter upper bound)", async () => {
        const getToken = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        const { client } = setup({ getToken, random: () => 0.999999 });
        await client().connect();
        const before = client().activate.mock.calls.length;

        await vi.advanceTimersByTimeAsync(1000);
        expect(client().activate.mock.calls.length).toBe(before + 1);
    });

    it("backs off with a capped delay when the server keeps answering with ERROR", async () => {
        const { session, client } = setup();
        const activations = () => client().activate.mock.calls.length;
        for (const delay of [1000, 2000, 4000, 4000]) {
            await client().connect();
            client().error();
            expect(client().deactivate).toHaveBeenCalled();
            const before = activations();
            await vi.advanceTimersByTimeAsync(delay - 1);
            expect(activations()).toBe(before);
            await vi.advanceTimersByTimeAsync(1);
            expect(activations()).toBe(before + 1);
        }
        expect(session.getStatus()).toBe("disconnected");
    });

    it("resets the backoff once a connection stays up", async () => {
        const { client } = setup();
        await client().connect();
        client().error();
        await vi.advanceTimersByTimeAsync(1000);
        await client().connect();
        await vi.advanceTimersByTimeAsync(10_000);

        client().drop();
        const before = client().activate.mock.calls.length;
        await vi.advanceTimersByTimeAsync(1000);
        expect(client().activate.mock.calls.length).toBe(before + 1);
    });

    it("does not re-subscribe a destination the server denied", async () => {
        const { session, client } = setup();
        const onDenied = vi.fn();
        session.onSubscriptionDenied(onDenied);
        session.subscribe(ROOM, vi.fn());
        await client().connect();
        const [roomSubscription] = client().live(ROOM);

        client().error({ "receipt-id": roomSubscription.headers.receipt });
        expect(onDenied).toHaveBeenCalledWith(ROOM);
        await vi.advanceTimersByTimeAsync(1000);
        await client().connect();

        expect(client().live(ROOM)).toHaveLength(0);
        expect(client().live(ERROR_QUEUE)).toHaveLength(1);
    });

    it("reports reconnects but not the first connect", async () => {
        const { session, client } = setup();
        const listener = vi.fn();
        session.onConnected(listener);
        await client().connect();
        expect(listener).toHaveBeenLastCalledWith({ reconnected: false });
        expect(session.getLastReconnectAt()).toBe(0);

        client().drop();
        await vi.advanceTimersByTimeAsync(1000);
        await client().connect();
        expect(listener).toHaveBeenLastCalledWith({ reconnected: true });
        expect(session.getLastReconnectAt()).toBeGreaterThan(0);
    });

    it("publishes only while connected and stops cleanly", async () => {
        const { session, client } = setup();
        expect(session.publish("/app/rooms/r1/typing", { typing: true })).toBe(false);
        await client().connect();
        expect(session.publish("/app/rooms/r1/typing", { typing: true })).toBe(true);
        expect(client().publish).toHaveBeenCalledWith({
            destination: "/app/rooms/r1/typing",
            body: JSON.stringify({ typing: true }),
        });

        session.stop();
        expect(session.getStatus()).toBe("idle");
        client().drop();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(client().activate).toHaveBeenCalledTimes(1);
    });
});
