package com.lnt.chatmee.dto.response;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonFormat;

/** One of the caller's blocks, as listed by {@code GET /users/me/blocks} (AC-009-15). */
public record BlockedUserResponse(
    String id,
    String name,
    String avatarUrl,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant blockedAt
) {
}
