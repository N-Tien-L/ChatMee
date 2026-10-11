package com.lnt.chatmee.dto.response;

import java.util.List;

/** A history page in oldest-first order; nextCursor requests strictly older messages. */
public record MessagePageResponse(List<ChatMessageResponse> messages, String nextCursor, boolean hasMore) {
}
