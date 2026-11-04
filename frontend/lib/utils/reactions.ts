import type { ReactionSummary, ReactionUpdatedEvent } from "@/lib/types";

/** The quick bar's defaults (SPEC-015 AC-015-10); any other emoji comes from the picker. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;

/** The emoji the current user reacted with, if any. */
export const myReaction = (reactions: ReactionSummary[] | undefined): string | null =>
    reactions?.find((reaction) => reaction.reactedByMe)?.emoji ?? null;

/**
 * The optimistic summary after the current user picks `emoji` (null removes their reaction). One reaction per
 * user (AC-015-1): the previous one loses a count and is dropped at zero; the new one gains a count.
 */
export function applyMyReaction(reactions: ReactionSummary[] | undefined, emoji: string | null): ReactionSummary[] {
    const previous = myReaction(reactions);
    const next = (reactions ?? [])
        .map((reaction) =>
            reaction.emoji === previous ? { ...reaction, count: reaction.count - 1, reactedByMe: false } : reaction)
        .filter((reaction) => reaction.count > 0);
    if (emoji === null) return next;
    const existing = next.find((reaction) => reaction.emoji === emoji);
    if (existing) {
        return next.map((reaction) =>
            reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, reactedByMe: true } : reaction);
    }
    return [...next, { emoji, count: 1, reactedByMe: true }];
}

/**
 * Applies a `REACTION_UPDATED` summary: the server's counts win, and `reactedByMe` keeps the current user's own
 * choice, which the event never carries (AC-015-7).
 */
export const fromRoomEvent = (current: ReactionSummary[] | undefined, event: ReactionUpdatedEvent): ReactionSummary[] => {
    const mine = myReaction(current);
    return event.summary.map(({ emoji, count }) => ({ emoji, count, reactedByMe: emoji === mine }));
};

export const isReactionEvent = (frame: unknown): frame is ReactionUpdatedEvent =>
    typeof frame === "object" && frame !== null && (frame as { event?: unknown }).event === "REACTION_UPDATED"
    && typeof (frame as { messageId?: unknown }).messageId === "string"
    && Array.isArray((frame as { summary?: unknown }).summary);
