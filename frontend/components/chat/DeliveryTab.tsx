"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { Message } from "@/lib/types";

interface DeliveryTabProps {
  message: Message;
  /** The list's time format, so the tab and the conversation read the same. */
  formatTime: (date: Date) => string;
}

/**
 * The mark under your own message (signature move of the CM-084 direction):
 * dashed while sending, inked with the confirmed time once the server echo arrives (AC-004-5, AC-008-13),
 * crimson "Not sent" on failure. The press animation runs only when motion is allowed.
 */
/** True once this message moved from sending to sent while on screen (never for history or a remounted room). */
export function useJustConfirmed(status: Message["status"]): boolean {
  const previousStatus = useRef(status);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (previousStatus.current === "sending" && status === "sent") setConfirmed(true);
    previousStatus.current = status;
  }, [status]);
  return confirmed;
}

export function DeliveryTab({ message, formatTime }: DeliveryTabProps) {
  const pressed = useJustConfirmed(message.status);

  const base =
    "inline-flex items-center gap-1 rounded-full px-2 font-mono text-[11px] leading-[18px] tabular";

  if (message.status === "sending") {
    return (
      <span className={`${base} border border-dashed border-muted-foreground/70 text-muted-foreground`}>
        <span role="img" aria-label="Sending" />
        <span aria-hidden="true">Sending…</span>
      </span>
    );
  }

  if (message.status === "failed") {
    return (
      <span className={`${base} border border-destructive text-destructive`}>
        <span role="img" aria-label="Failed to send" title={message.errorMessage || "Failed to send"}>
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
        </span>
        <span aria-hidden="true">Not sent</span>
        <time dateTime={message.createdAt}>{formatTime(new Date(message.createdAt))}</time>
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-card text-foreground shadow-sm ring-1 ring-border ${
        pressed ? "animate-stamp animate-confirm" : ""
      }`}
    >
      <span role="img" aria-label="Sent" className="grid h-3.5 w-3.5 place-items-center rounded-full bg-spot text-spot-foreground">
        {/* The check draws itself when the server confirms (signature moment, D-16). */}
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
          <path
            d="M2.5 6.4 5 8.8l4.6-5.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className={pressed ? "animate-draw-check" : undefined}
          />
        </svg>
      </span>
      <time dateTime={message.createdAt}>{formatTime(new Date(message.createdAt))}</time>
    </span>
  );
}
