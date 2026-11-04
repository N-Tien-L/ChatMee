package com.lnt.chatmee.dto.response;

import java.util.List;

/** Who reacted, newest first; {@code nextCursor} requests strictly older entries. */
public record ReactorPageResponse(List<ReactorResponse> reactions, String nextCursor, boolean hasMore) {
}
