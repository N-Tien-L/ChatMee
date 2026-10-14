"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Compass, CornerDownLeft, Hash, Inbox, Lock, MessageSquarePlus, Search, UsersRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { UserAvatar } from "@/components/common/UserAvatar";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useDiscoverRoomsStore } from "@/lib/stores/discoverRoomsStore";
import { useInboxStore } from "@/lib/stores/inboxStore";
import { ChatRoom, RoomType } from "@/lib/types";

const OPEN_EVENT = "chatmee:quick-switcher";

/** Opens the quick switcher from anywhere (a button, the welcome screen). */
export function openQuickSwitcher() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Item =
  | { kind: "room"; id: string; label: string; room: ChatRoom }
  | { kind: "action"; id: string; label: string; icon: typeof Hash; run: () => void };

const MAX_ROOMS = 8;

const nameOf = (room: ChatRoom) => room.displayName || room.counterpart?.name || room.roomName;

/** Ctrl/Cmd+K: jump to any room or person, or start something new (D-16). Arrow keys move, Enter opens. */
export function QuickSwitcher() {
  const router = useRouter();
  const rooms = useChatRoomsStore((state) => state.rooms);
  const openCreate = useChatRoomsStore((state) => state.openCreateRoomModal);
  const openDiscover = useDiscoverRoomsStore((state) => state.open);
  const openInbox = useInboxStore((state) => state.open);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const roomItems: Item[] = rooms
      .filter((room) => !q || nameOf(room).toLowerCase().includes(q))
      .slice(0, MAX_ROOMS)
      .map((room) => ({ kind: "room", id: room.id, label: nameOf(room), room }));
    const actions: Item[] = [
      { kind: "action", id: "new-message", label: "New message", icon: MessageSquarePlus, run: () => openCreate("direct") },
      { kind: "action", id: "new-room", label: "New room", icon: UsersRound, run: () => openCreate("room") },
      { kind: "action", id: "discover", label: "Discover public rooms", icon: Compass, run: () => openDiscover() },
      { kind: "action", id: "inbox", label: "Open inbox", icon: Inbox, run: () => openInbox() },
    ];
    return [...roomItems, ...actions.filter((a) => !q || a.label.toLowerCase().includes(q))];
  }, [rooms, query, openCreate, openDiscover, openInbox]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.kind === "room") router.push(`/dashboard?roomId=${item.id}`, { scroll: false });
    else item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(items.length, 1);
      setActive(next);
      listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(items[active]);
    }
  };

  const firstAction = items.findIndex((item) => item.kind === "action");

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[560px] [&>*]:min-w-0 [&>button.absolute]:hidden">
        <DialogTitle className="sr-only">Quick switcher</DialogTitle>
        <DialogDescription className="sr-only">Type to find a room or person. Arrow keys move, Enter opens.</DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-switcher-list"
            aria-activedescendant={items[active] ? `qs-${items[active].id}` : undefined}
            aria-label="Find a room or person"
            placeholder="Find a room or person…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul id="quick-switcher-list" role="listbox" ref={listRef} className="max-h-[50dvh] overflow-y-auto p-2">
          {items.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</li>}
          {items.map((item, index) => {
            const selected = index === active;
            return (
              <li key={item.id} role="presentation">
                {index === 0 && item.kind === "room" && (
                  <p className="px-3 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Chats</p>
                )}
                {index === firstAction && (
                  <p className="px-3 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Actions</p>
                )}
                <div
                  id={`qs-${item.id}`}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(item)}
                  className="relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2"
                >
                  {selected && (
                    <motion.span
                      layoutId="quick-switcher-active"
                      className="absolute inset-0 -z-0 rounded-xl bg-accent"
                      transition={{ type: "spring", stiffness: 600, damping: 40 }}
                    />
                  )}
                  <span className="relative flex flex-1 items-center gap-3 overflow-hidden">
                    {item.kind === "room" ? (
                      item.room.roomType === RoomType.DIRECT_MESSAGE ? (
                        <UserAvatar name={item.label} avatarUrl={item.room.counterpart?.avatarUrl} size="md" />
                      ) : (
                        <RoomAvatar name={item.label} className="h-8 w-8 rounded-lg" />
                      )
                    ) : (
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-primary">
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                    {item.kind === "room" && item.room.roomType === RoomType.PRIVATE && (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    )}
                    {item.kind === "room" && (item.room.unreadCount ?? 0) > 0 && (
                      <span className="rounded-full bg-spot px-1.5 font-mono text-[11px] text-spot-foreground">{item.room.unreadCount}</span>
                    )}
                    {selected && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
