import { afterEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosError } from "axios";
import { apiClient } from "./apiClient";

afterEach(() => vi.unstubAllGlobals());

function fail(status: number, data: unknown) {
    return apiClient.get("/api/v1/users", {
        adapter: async (config) => {
            throw new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, undefined, {
                status, statusText: "Error", data, headers: {}, config,
            });
        },
    });
}

describe("API problem responses", () => {
    it("redirects an expired session to login", async () => {
        const location = { pathname: "/dashboard", href: "/dashboard" };
        vi.stubGlobal("window", { location });
        await expect(fail(401, { detail: "Authentication required" })).rejects.toThrow("Authentication required");
        expect(location.href).toBe("/login?reason=expired");
    });

    it("avoids redirect loops on login", async () => {
        const location = { pathname: "/login", href: "/login?returnTo=chat" };
        vi.stubGlobal("window", { location });
        await expect(fail(401, {})).rejects.toThrow("Request failed");
        expect(location.href).toBe("/login?returnTo=chat");
    });

    it("exposes problem detail as an Error message", async () => {
        await expect(fail(409, { detail: "User is already in the room" })).rejects.toThrow("User is already in the room");
    });

    it("preserves the cause and handles responses without detail", async () => {
        const failure = await fail(500, "HTML error").catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toBe("Request failed");
        expect(axios.isAxiosError((failure as Error).cause)).toBe(true);
    });

    it("handles 401 during server rendering", async () => {
        vi.stubGlobal("window", undefined);
        await expect(fail(401, { detail: "Authentication required" })).rejects.toThrow("Authentication required");
    });
});
