"use client";

import type { ReactionSummary } from "@/lib/types";

interface ReactionChipsProps {
  reactions?: ReactionSummary[];
  /** Aligns the row under your own (right-aligned) bubble. */
  own?: boolean;
  /** Opens the who-reacted list, filtered to the tapped emoji (SPEC-015 AC-015-10). */
  onOpen?: (emoji: string) => void;
}

/** Counts under a bubble; your own reaction is highlighted. */
export function ReactionChips({ reactions, own = false, onOpen }: ReactionChipsProps) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <ul
      aria-label="Reactions"
      className={`relative z-[1] -mt-1.5 flex max-w-full flex-wrap gap-1 px-2 ${own ? "justify-end" : "justify-start"}`}
    >
      {reactions.map((reaction) => (
        <li key={reaction.emoji}>
          <button
            type="button"
            onClick={() => onOpen?.(reaction.emoji)}
            disabled={!onOpen}
            aria-label={`${reaction.emoji} ${reaction.count}${reaction.reactedByMe ? ", including you" : ""}. Show who reacted`}
            className={`flex h-6 items-center gap-1 rounded-full px-2 text-xs tabular shadow-sm ring-1 transition-colors disabled:cursor-default ${
              reaction.reactedByMe
                ? "bg-primary/10 text-primary ring-primary/40"
                : "bg-card text-muted-foreground ring-border hover:bg-accent"
            }`}
          >
            <span aria-hidden="true" className="text-sm leading-none">{reaction.emoji}</span>
            <span aria-hidden="true" className="font-medium">{reaction.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
