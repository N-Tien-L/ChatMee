// Responses (backend dto/response records)

export interface UserResponse {
    id: string
    name: string
    email: string
    avatarUrl: string
    provider: string
}

/** Another user's public profile: never carries an email (CM-047). */
export interface UserSummaryResponse {
    id: string;
    name: string;
    avatarUrl: string;
}

export interface AuthResponse {
    authenticated: boolean
    user?: UserResponse
    message: string
}
