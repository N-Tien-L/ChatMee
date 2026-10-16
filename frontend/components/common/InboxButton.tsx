"use client";

import { AnimatePresence, motion } from "motion/react";
import { Inbox } from "lucide-react";
import { useInboxStore } from "@/lib/stores/inboxStore";

/** Header inbox trigger. Quiet when empty; glows and pulses while invitations or requests wait. */
export function InboxButton() {
  const openInbox = useInboxStore((state) => state.open);
  const count = useInboxStore((state) => state.invitations.length + state.requests.length);
  const hasItems = count > 0;

  return (
    <button
      type="button"
      onClick={() => openInbox()}
      title="Inbox"
      aria-label={hasItems ? `Inbox, ${count} waiting` : "Inbox"}
      className={`relative grid h-9 w-9 place-items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-shell-foreground ${
        hasItems
          ? "border-spot bg-spot/20 text-spot shadow-[0_0_14px_rgb(255_122_61/0.55)] hover:bg-spot/30"
          : "border-shell-foreground/20 text-shell-foreground/80 hover:border-shell-foreground/40 hover:bg-shell-foreground/10 hover:text-shell-foreground"
      }`}
    >
      {hasItems && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-ping rounded-full border-2 border-spot/70 motion-reduce:hidden"
        />
      )}
      <Inbox className="relative h-[18px] w-[18px]" aria-hidden="true" />
      <AnimatePresence>
        {hasItems && (
          <motion.span
            key={count}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 18 }}
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-spot px-1 font-mono text-[11px] font-bold text-spot-foreground ring-2 ring-shell"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
