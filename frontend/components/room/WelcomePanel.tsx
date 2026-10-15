"use client";

import dynamic from "next/dynamic";
import { MessageSquarePlus, Search, UsersRound } from "lucide-react";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useIsDark } from "@/lib/theme/useIsDark";

const ConstellationGrid = dynamic(() => import("@/components/fx/constellation-grid"), { ssr: false });

/** The workspace with no room open: the landing's constellation mesh, a greeting and the three ways to start (D-16). */
export function WelcomePanel({ onOpenSwitcher }: { onOpenSwitcher: () => void }) {
  const dark = useIsDark();
  const openCreate = useChatRoomsStore((state) => state.openCreateRoomModal);
  return (
    <div className="relative isolate flex flex-1 items-center justify-center overflow-hidden">
      <ConstellationGrid
        key={dark ? "dark" : "light"}
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,black_30%,transparent_100%)]"
        nodeColor={dark ? "234, 245, 242" : "15, 31, 28"}
        accentColor={dark ? "46, 230, 193" : "11, 107, 93"}
        ringColor={dark ? "255, 106, 61" : "217, 68, 31"}
      />
      <div className="mx-4 flex max-w-md flex-col items-center rounded-3xl bg-background/70 px-8 py-10 text-center backdrop-blur-sm">
        <p className="font-display text-3xl font-semibold tracking-[-0.02em]">Pick up where you left off</p>
        <p className="mt-2 text-sm text-muted-foreground">Choose a chat on the left, or start something new.</p>
        <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => openCreate("direct")}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:brightness-110 active:scale-[0.98]"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> New message
          </button>
          <button
            type="button"
            onClick={() => openCreate("room")}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <UsersRound className="h-4 w-4 text-primary" aria-hidden="true" /> New room
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenSwitcher}
          className="mt-4 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Jump to any chat
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
        </button>
      </div>
    </div>
  );
}
