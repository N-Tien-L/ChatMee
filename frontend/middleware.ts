import { NextResponse, type NextRequest } from "next/server";

// The backend session cookie reaches this domain through the /api rewrites (same origin).
export const SESSION_COOKIE = "JSESSIONID";

/**
 * UX guard only: visitors without a session cookie never see a flash of the protected pages.
 * Real authorization stays on the backend (an expired session still gets 401 -> /login from apiClient).
 * /login is deliberately not redirected away from: a stale cookie would otherwise cause a loop.
 */
export function middleware(request: NextRequest) {
    if (request.cookies.has(SESSION_COOKIE)) {
        return NextResponse.next();
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: ["/dashboard/:path*", "/profile/:path*"],
};
