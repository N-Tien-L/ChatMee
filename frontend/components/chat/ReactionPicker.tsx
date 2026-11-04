"use client";

import dynamic from "next/dynamic";
import { ReactionSurface } from "./ReactionSurface";

// Lazy: the picker library and its emoji data load only when "+" is used (SPEC-015 §7).
const EmojiPickerPanel = dynamic(() => import("./EmojiPickerPanel"), {
  ssr: false,
  loading: () => (
    <p role="status" className="flex h-[min(360px,60dvh)] items-center justify-center text-sm text-muted-foreground">
      Loading emoji…
    </p>
  ),
});

interface ReactionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
}

/** "+" from the quick bar: any emoji as the reaction (SPEC-015 US-2, AC-015-10). */
export function ReactionPicker({ open, onOpenChange, onSelect }: ReactionPickerProps) {
  return (
    <ReactionSurface
      open={open}
      onOpenChange={onOpenChange}
      title="Choose a reaction"
      description="Search or browse emoji to react to this message."
    >
      {open && <EmojiPickerPanel onSelect={onSelect} />}
    </ReactionSurface>
  );
}
