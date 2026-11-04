package com.lnt.chatmee.repository;

import java.time.Instant;

/** One emoji's aggregate on one message; {@code mine} is 1 when the asking user chose it. */
public record ReactionTally(String messageId, String emoji, long count, Instant firstAt, int mine) {
}
