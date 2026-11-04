package com.lnt.chatmee.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code PUT .../reaction} body; the value is checked by {@code EmojiValidator} in the service (AC-015-3). */
public record ReactionRequest(
        @NotBlank(message = "Emoji is required")
        @Size(max = 32, message = "Emoji is too long")
        String emoji) {
}
