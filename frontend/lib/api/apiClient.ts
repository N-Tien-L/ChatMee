import axios from "axios"

// Using Vercel proxy - all API calls go through same domain
// No need for external URL, requests will be rewritten by Next.js
const API_BASE_URL = "";

// create axios instance
export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true, // include cookies for authentication
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
                window.location.href = "/login";
            }
            const detail = error.response?.data?.detail;
            return Promise.reject(new Error(typeof detail === "string" && detail ? detail : error.message, { cause: error }));
        }
        return Promise.reject(error instanceof Error ? error : new Error("Request failed"));
    }
);
