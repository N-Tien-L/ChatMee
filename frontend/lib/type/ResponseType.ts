export interface UserResponse {
    id: string
    name: string
    email: string
    avatarUrl: string
    provider: string
}

export interface AuthResponse {
    authenticated: string
    user?: UserResponse
    message: string
}

export interface ApiResponse<T> {
    success: boolean
    message?: string
    data: T;
}