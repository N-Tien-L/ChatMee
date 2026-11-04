"use client";

import { RotateCw } from "lucide-react";
import type { ReactionSummary, Reactor } from "@/lib/types";
import { UserAvatar } from "../common/UserAvatar";
import { ReactionSurface } from "./ReactionSurface";

interface ReactorsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The message's summary, for the filter tabs. */
  reactions: ReactionSummary[];
  /** The selected filter; null shows every emoji. */
  emoji: string | null;
  onEmojiChange: (emoji: string | null) => void;
  reactors: Reactor[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  currentUserId?: string;
}

const TAB = "flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-sm transition-colors";

/** Who reacted with what (SPEC-015 US-3, AC-015-6, AC-015-10). */
export function ReactorsSheet({
  open, onOpenChange, reactions, emoji, onEmojiChange, reactors, loading, error, hasMore, onLoadMore, onRetry,
  currentUserId,
}: ReactorsSheetProps) {
  const total = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
  const tab = (value: string | null, label: React.ReactNode, name: string) => (
    <button
      key={value ?? "all"}
      type="button"
      role="tab"
      aria-selected={emoji === value}
      aria-label={name}
      onClick={() => onEmojiChange(value)}
      className={`${TAB} ${emoji === value ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent"}`}
    >
      {label}
    </button>
  );

  return (
    <ReactionSurface open={open} onOpenChange={onOpenChange} title="Reactions" description="People who reacted to this message.">
      <div role="tablist" aria-label="Filter by reaction" className="flex gap-1 overflow-x-auto px-2 pb-2">
        {tab(null, <>All <span className="tabular">{total}</span></>, `All reactions, ${total}`)}
        {reactions.map((reaction) =>
          tab(reaction.emoji, <><span aria-hidden="true">{reaction.emoji}</span><span className="tabular">{reaction.count}</span></>,
            `${reaction.emoji}, ${reaction.count}`))}
      </div>
      <div role="tabpanel" className="max-h-[min(360px,55dvh)] overflow-y-auto px-2">
        {error && (
          <div role="alert" className="my-2 flex items-center gap-3 rounded-xl bg-danger-surface px-3 py-2 text-sm text-destructive">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={onRetry} className="flex items-center gap-1 font-semibold underline">
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        )}
        <ul aria-label="People who reacted" className="divide-y divide-border">
          {reactors.map((reactor) => (
            <li key={`${reactor.userId}-${reactor.emoji}`} className="flex items-center gap-3 py-2.5">
              <UserAvatar name={reactor.displayName} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {reactor.displayName}
                {reactor.userId === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
              </span>
              <span className="text-xl" aria-label={`Reacted with ${reactor.emoji}`}>{reactor.emoji}</span>
            </li>
          ))}
        </ul>
        {loading && (
          <p role="status" className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {!loading && !error && reactors.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No reactions yet.</p>
        )}
        {hasMore && !loading && (
          <button type="button" onClick={onLoadMore} className="my-2 w-full rounded-xl py-2 text-sm font-medium text-primary hover:bg-accent">
            Show more
          </button>
        )}
      </div>
    </ReactionSurface>
  );
}
