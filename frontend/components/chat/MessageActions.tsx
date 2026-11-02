"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Copy, CornerUpLeft, Flag } from "lucide-react";
import type { Message } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/** A touch that moves less than this is a tap; beyond it the dominant axis decides between swipe and scroll. */
export const SWIPE_SLOP_PX = 10;
/** Swiping right at least this far starts a reply (SPEC-014 AC-014-10). */
export const SWIPE_REPLY_PX = 56;
/** The bubble follows the finger up to this distance. */
const SWIPE_MAX_PX = 80;

interface MessageActionsProps {
  message: Message;
  /** The list's formatted time, shown at the top of the menu so touch screens can read it too. */
  timeLabel: string;
  onReport?: (message: Message) => void;
  /** Starts a reply to this message: the menu item, and a right swipe on touch screens (SPEC-014). */
  onReply?: (message: Message) => void;
  /** Bubble sizing classes, applied to the wrapper that receives the click. */
  className?: string;
  children: React.ReactNode;
}

type Gesture = { pointerId: number; x: number; y: number; axis: "x" | "y" | null };

/**
 * Click, tap, right click or long press on a bubble opens its actions, so no per-message icon has to stay on screen.
 * The long press arrives as a `contextmenu` event on touch devices. On touch the menu opens on release, so a scroll
 * or a swipe that starts on a bubble never opens it; a right swipe starts a reply instead.
 */
export function MessageActions({ message, timeLabel, onReport, onReply, className = "", children }: MessageActionsProps) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const reportAfterClose = useRef(false);
  const replyAfterClose = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const canReply = !!onReply && !!message.id;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const endGesture = () => {
    gesture.current = null;
    setOffset(0);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    // Skips the menu's open-on-press for touch; release decides between tap, swipe and scroll.
    event.preventDefault();
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.axis === null) {
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
      current.axis = Math.abs(dx) > Math.abs(dy) && canReply ? "x" : "y";
    }
    if (current.axis === "x") setOffset(Math.max(0, Math.min(dx, SWIPE_MAX_PX)));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    endGesture();
    if (current.axis === null) setOpen(true);
    else if (current.axis === "x" && dx >= SWIPE_REPLY_PX && canReply) onReply?.(message);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div className={`relative ${className}`}>
        {canReply && offset > 0 && (
          <span
            aria-hidden="true"
            data-testid="swipe-reply-hint"
            className="pointer-events-none absolute left-0 top-1/2 flex h-7 w-7 -translate-x-full -translate-y-1/2 items-center justify-center rounded-full bg-muted text-primary"
            style={{ opacity: Math.min(1, offset / SWIPE_REPLY_PX) }}
          >
            <CornerUpLeft size={14} />
          </span>
        )}
        <DropdownMenuTrigger asChild>
          <div
            ref={triggerRef}
            role="button"
            tabIndex={0}
            aria-label="More actions"
            onContextMenu={(event) => {
              event.preventDefault();
              endGesture();
              setOpen(true);
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={endGesture}
            style={offset ? { transform: `translateX(${offset}px)` } : undefined}
            className={`cursor-pointer select-text rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-touch-callout:none] touch-pan-y ${
              offset ? "" : "transition-transform duration-200 motion-reduce:transition-none"
            }`}
          >
            {children}
          </div>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        align={message.isOwn ? "end" : "start"}
        className="min-w-40"
        onCloseAutoFocus={(event) => {
          if (replyAfterClose.current) {
            // The composer takes focus for the reply, not the bubble.
            event.preventDefault();
            replyAfterClose.current = false;
            onReply?.(message);
            return;
          }
          if (!reportAfterClose.current) return;
          // The menu's focus/pointer layer must unmount before the modal opens.
          event.preventDefault();
          reportAfterClose.current = false;
          triggerRef.current?.focus();
          onReport?.(message);
        }}
      >
        <DropdownMenuLabel className="font-mono text-[11px] font-normal text-muted-foreground">
          {timeLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canReply && (
          <DropdownMenuItem onSelect={() => { replyAfterClose.current = true; }}>
            <CornerUpLeft aria-hidden="true" />
            Reply
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={copy}>
          <Copy aria-hidden="true" />
          Copy text
        </DropdownMenuItem>
        {onReport && !message.isOwn && message.id && (
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => { reportAfterClose.current = true; }}
          >
            <Flag aria-hidden="true" />
            Report message
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
