package com.lnt.chatmee.exception;

/** A user reached a per-day action limit (SPEC-009 AC-009-29). Mapped to 429 with a Retry-After header. */
public class RateLimitExceededException extends ChatMeeException {

    private final long retryAfterSeconds;

    public RateLimitExceededException(long retryAfterSeconds) {
        super(ErrorCode.RATE_LIMITED, "Daily limit reached, try again later");
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
