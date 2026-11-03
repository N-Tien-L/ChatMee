"use client";

import { EmojiPicker } from "frimousse";

/**
 * The full emoji picker (SPEC-015 US-2). Loaded on demand by ReactionPicker so the first chat bundle does not grow.
 * Emoji data comes from the library's default Emojibase source.
 */
export default function EmojiPickerPanel({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <EmojiPicker.Root
      columns={8}
      onEmojiSelect={({ emoji }) => onSelect(emoji)}
      className="isolate flex h-[min(360px,60dvh)] w-full flex-col"
    >
      <EmojiPicker.Search
        aria-label="Search emoji"
        placeholder="Search emoji"
        className="mx-2 mb-2 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <EmojiPicker.Viewport className="relative flex-1 outline-hidden">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading emoji…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-background px-3 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                type="button"
                aria-label={emoji.label}
                className="flex size-9 items-center justify-center rounded-lg text-xl data-[active]:bg-accent"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
