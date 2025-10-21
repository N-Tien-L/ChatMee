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