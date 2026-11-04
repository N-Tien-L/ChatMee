package com.lnt.chatmee.dto.response;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonFormat;

/** One entry of the who-reacted list (SPEC-015 AC-015-6). */
public record ReactorResponse(String userId, String displayName, String emoji,
        @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt) {
}
