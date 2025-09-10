import axios from "axios"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// create axios instance
export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true, // include cookies for authentication
    headers: {
        "Content-Type": "application/json"
    }
})