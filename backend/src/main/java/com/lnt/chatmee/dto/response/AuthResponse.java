package com.lnt.chatmee.dto.response;

import lombok.Builder;

@Builder
public record AuthResponse(
    boolean authenticated,
    UserResponse user,
    String message
) {
    public static AuthResponse from(UserResponse user) {
        return new AuthResponse(true, user, "User authenticated successfully");
    }
}
