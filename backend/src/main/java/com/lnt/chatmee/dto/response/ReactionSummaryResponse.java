package com.lnt.chatmee.dto.response;

/** One emoji on a message: how many chose it and whether the caller did (SPEC-015 AC-015-5). */
public record ReactionSummaryResponse(String emoji, long count, boolean reactedByMe) {
}
