import { User } from "../entities/user/user.entity"

// Request

export interface UpdateUserRequest {
    name?: string
    email?: string
    profilePicURL?: string
}

// Response

export interface AuthResponse {
    authenticated: string
    user?: User
    message: string
}

export interface UserResponse {
    id: string
    name: string
    email: string
    avatarUrl: string
    provider: string
}