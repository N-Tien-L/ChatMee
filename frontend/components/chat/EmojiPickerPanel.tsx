"use client";

import { EmojiPicker } from "frimousse";
import { useCallback, useEffect, useRef, useState } from "react";

// Emojibase group labels (as frimousse reports them) paired with a tab icon.
const CATEGORY_TABS = [
  { label: "Smileys & Emotion", icon: "😀" },
  { label: "People & Body", icon: "👋" },
  { label: "Animals & Nature", icon: "🐻" },
  { label: "Food & Drink", icon: "🍔" },
  { label: "Travel & Places", icon: "✈️" },
  { label: "Activities", icon: "⚽" },
  { label: "Objects", icon: "💡" },
  { label: "Symbols", icon: "❤️" },
  { label: "Flags", icon: "🏳️" },
] as const;

const SCROLL_IDLE_MS = 900;

const norm = (text: string | null | undefined) => (text ?? "").trim().toLowerCase();

function categoryHeaders(viewport: HTMLElement): HTMLElement[] {
  // The hidden sizer also renders a header; only the real ones sit outside aria-hidden.
  return Array.from(viewport.querySelectorAll<HTMLElement>("[frimousse-category]")).filter(
    (el) => !el.closest("[aria-hidden='true']"),
  );
}

/**
 * The full emoji picker (SPEC-015 US-2). Loaded on demand by ReactionPicker so the first chat bundle does not grow.
 * Emoji data comes from the library's default Emojibase source.
 */
export default function EmojiPickerPanel({ onSelect }: { onSelect: (emoji: string) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [scrolling, setScrolling] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string>(CATEGORY_TABS[0].label);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const handleScroll = useCallback(() => {
    setScrolling(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setScrolling(false), SCROLL_IDLE_MS);

    const viewport = viewportRef.current;
    if (!viewport) return;
    let current: string | null = null;
    for (const el of categoryHeaders(viewport)) {
      if (el.offsetTop <= viewport.scrollTop + 4) current = norm(el.textContent) || current;
    }
    if (current) setActiveLabel(current);
  }, []);

  const jumpTo = (label: string) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const target = categoryHeaders(viewport).find((el) => norm(el.textContent) === norm(label));
    if (target) viewport.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    setActiveLabel(label);
  };

  return (
    <EmojiPicker.Root
      columns={8}
      onEmojiSelect={({ emoji }) => onSelect(emoji)}
      className="isolate flex h-[min(420px,64dvh)] w-full flex-col"
    >
      <EmojiPicker.Search
        aria-label="Search emoji"
        placeholder="Search emoji"
        onChange={(e) => setSearching(e.target.value.length > 0)}
        className="mx-2 mb-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {!searching && (
        <div role="tablist" aria-label="Emoji categories" className="mb-1 flex items-center justify-between px-2">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={norm(activeLabel) === norm(tab.label)}
              aria-label={tab.label}
              title={tab.label}
              onClick={() => jumpTo(tab.label)}
              className="relative flex h-9 flex-1 items-center justify-center text-lg opacity-60 transition-opacity hover:opacity-100 aria-selected:opacity-100 aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:rounded-full aria-selected:after:bg-primary"
            >
              {tab.icon}
            </button>
          ))}
        </div>
      )}
      <EmojiPicker.Viewport
        ref={viewportRef}
        onScroll={handleScroll}
        data-scrolling={scrolling ? "" : undefined}
        className="emoji-scroll relative flex-1 outline-hidden"
      >
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
              <div className="bg-background px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                type="button"
                aria-label={emoji.label}
                className="flex aspect-square flex-1 items-center justify-center rounded-lg text-[28px] leading-none data-[active]:bg-accent"
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
