package com.lnt.chatmee.dto.response;

import lombok.Builder;

@Builder
public record UserResponse(
    String id,
    String name,
    String email,
    String avatarUrl,
    String provider
) {
    public static UserResponse from(com.lnt.chatmee.model.User user) {
        return new UserResponse(user.getId(), user.getName(), user.getEmail(), user.getAvatarUrl(), user.getProvider());
    }
}
