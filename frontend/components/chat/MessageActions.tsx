"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Copy, Flag } from "lucide-react";
import type { Message } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface MessageActionsProps {
  message: Message;
  /** The list's formatted time, shown at the top of the menu so touch screens can read it too. */
  timeLabel: string;
  onReport?: (message: Message) => void;
  /** Bubble sizing classes, applied to the wrapper that receives the click. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Click, tap, right click or long press on a bubble opens its actions, so no per-message icon has to stay on screen.
 * The long press arrives as a `contextmenu` event on touch devices.
 */
export function MessageActions({ message, timeLabel, onReport, className = "", children }: MessageActionsProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const reportAfterClose = useRef(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <div
          ref={triggerRef}
          role="button"
          tabIndex={0}
          aria-label="More actions"
          onContextMenu={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          className={`cursor-pointer select-text rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-touch-callout:none] ${className}`}
        >
          {children}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={message.isOwn ? "end" : "start"}
        className="min-w-40"
        onCloseAutoFocus={(event) => {
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
