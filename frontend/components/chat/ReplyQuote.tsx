"use client";

import { CornerUpLeft, X } from "lucide-react";
import { MessageType, ReplyTo } from "@/lib/types";

/** Label for a quote whose original has no text (SPEC-014: media previews show a type label). */
const TYPE_LABEL: Record<MessageType, string> = {
  [MessageType.TEXT]: "Message",
  [MessageType.IMAGE]: "Photo",
  [MessageType.VIDEO]: "Clip",
  [MessageType.VOICE]: "Voice message",
  [MessageType.FILE]: "File",
  [MessageType.SYSTEM]: "System message",
};

export const UNAVAILABLE_ORIGINAL = "Original message unavailable";

/** The line a quote or the reply chip shows; null once the original is deleted (AC-014-5). */
export function quoteText(replyTo: Pick<ReplyTo, "preview" | "type">): string | null {
  if (replyTo.preview === null) return null;
  return replyTo.preview || TYPE_LABEL[replyTo.type] || "Message";
}

interface ReplyQuoteProps {
  replyTo: ReplyTo;
  /** Inside your own gradient bubble the quote uses the bubble's foreground. */
  own?: boolean;
  /** Absent while the reply is still sending: the quote is shown but not yet a link. */
  onJump?: (messageId: string) => void;
}

/** The quote at the top of a reply bubble; tapping it jumps to the original (AC-014-8). */
export function ReplyQuote({ replyTo, own = false, onJump }: ReplyQuoteProps) {
  const text = quoteText(replyTo);
  const tone = own
    ? "border-primary-foreground/60 bg-primary-foreground/15 text-primary-foreground"
    : "border-primary/60 bg-muted text-foreground";
  const body = (
    <>
      <span className="block truncate text-xs font-semibold">{replyTo.senderName}</span>
      <span className={`block text-xs line-clamp-2 break-words ${text === null ? "italic opacity-80" : "opacity-90"}`}>
        {text ?? UNAVAILABLE_ORIGINAL}
      </span>
    </>
  );
  const base = `mb-1.5 block w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left ${tone}`;
  if (text === null || !onJump) {
    return <div data-testid="reply-quote" className={base}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-testid="reply-quote"
      // The bubble's actions menu must not open from a tap on the quote.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onJump(replyTo.messageId);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={`Jump to the message from ${replyTo.senderName} this replies to`}
      className={`${base} cursor-pointer outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
    </button>
  );
}

interface ReplyChipProps {
  replyTo: Pick<ReplyTo, "senderName" | "preview" | "type">;
  onCancel: () => void;
}

/** "Replying to ..." above the composer, with cancel (AC-014-7). */
export function ReplyChip({ replyTo, onCancel }: ReplyChipProps) {
  const text = quoteText(replyTo);
  return (
    <div
      role="status"
      aria-label={`Replying to ${replyTo.senderName}`}
      className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
    >
      <CornerUpLeft size={16} aria-hidden="true" className="flex-shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">Replying to {replyTo.senderName}</p>
        <p className="truncate text-xs text-muted-foreground">{text ?? UNAVAILABLE_ORIGINAL}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
