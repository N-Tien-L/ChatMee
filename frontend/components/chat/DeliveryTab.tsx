"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
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
export function DeliveryTab({ message, formatTime }: DeliveryTabProps) {
  // Press only on the sending -> sent transition, never for history or when a room remounts.
  const previousStatus = useRef(message.status);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (previousStatus.current === "sending" && message.status === "sent") setPressed(true);
    previousStatus.current = message.status;
  }, [message.status]);

  const base =
    "inline-flex items-center gap-1 rounded-[3px] px-1.5 font-mono text-[11px] leading-[18px] tabular";

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
      className={`${base} -rotate-[1.5deg] border-[1.5px] border-primary text-primary ${
        pressed ? "animate-stamp" : ""
      }`}
    >
      <span role="img" aria-label="Sent">
        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <time dateTime={message.createdAt}>{formatTime(new Date(message.createdAt))}</time>
    </span>
  );
}
