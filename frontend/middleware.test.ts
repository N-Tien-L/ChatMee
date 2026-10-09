import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

describe("route guard middleware", () => {
    it("redirects a visitor without a session cookie to /login", () => {
        const response = middleware(new NextRequest("http://localhost:3000/dashboard"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    });

    it("lets a request with a session cookie through", () => {
        const request = new NextRequest("http://localhost:3000/dashboard", {
            headers: { cookie: "JSESSIONID=abc" },
        });

        const response = middleware(request);

        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("guards only the dashboard and profile pages", () => {
        expect(config.matcher).toEqual(["/dashboard/:path*", "/profile/:path*"]);
    });
});
