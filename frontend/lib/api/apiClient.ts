import axios from "axios"

// Using Vercel proxy - all API calls go through same domain
// No need for external URL, requests will be rewritten by Next.js
const API_BASE_URL = "";

// create axios instance
export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true, // include cookies for authentication
    xsrfCookieName: "XSRF-TOKEN",
    xsrfHeaderName: "X-XSRF-TOKEN",
    withXSRFToken: true,
    headers: {
        "Content-Type": "application/json"
    }
})

apiClient.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        if (axios.isAxiosError<{ detail?: unknown }>(error)) {
            if (error.response?.status === 401 && typeof window !== "undefined"
                && window.location.pathname !== "/login") {
                // The session ended while the app was open; /login says so (CM-084 G2).
                window.location.href = "/login?reason=expired";
            }
            const detail = error.response?.data?.detail;
            return Promise.reject(new Error(typeof detail === "string" && detail ? detail : error.message, { cause: error }));
        }
        return Promise.reject(error instanceof Error ? error : new Error("Request failed"));
    }
);
