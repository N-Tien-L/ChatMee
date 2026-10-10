import { describe, expect, it } from "vitest";
import { toWebSocketUrl } from "./stompClient";

describe("toWebSocketUrl", () => {
    it("maps http to ws", () => {
        expect(toWebSocketUrl("http://localhost:8080/ws")).toBe("ws://localhost:8080/ws");
    });

    it("maps https to wss", () => {
        expect(toWebSocketUrl("https://api.example.com/ws")).toBe("wss://api.example.com/ws");
    });

    it("keeps ws and wss URLs unchanged", () => {
        expect(toWebSocketUrl("ws://localhost:8080/ws")).toBe("ws://localhost:8080/ws");
        expect(toWebSocketUrl("wss://api.example.com/ws")).toBe("wss://api.example.com/ws");
    });
});
