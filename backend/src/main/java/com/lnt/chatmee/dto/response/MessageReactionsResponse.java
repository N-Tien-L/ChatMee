package com.lnt.chatmee.dto.response;

import java.util.List;

/** The caller's view of one message's reactions after a change (SPEC-015 AC-015-1). */
public record MessageReactionsResponse(String messageId, List<ReactionSummaryResponse> reactions) {
}
