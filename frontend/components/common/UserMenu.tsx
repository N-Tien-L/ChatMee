"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "./UserAvatar";

interface UserMenuProps {
  user: { name: string; avatarUrl?: string | null };
  onSignOut: () => void;
}

const ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent focus-visible:bg-accent";

export function UserMenu({ user, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full focus-visible:outline-2 focus-visible:outline-shell-foreground"
      >
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
            {user.name}
          </p>
          <Link
            href="/profile"
            role="menuitem"
            className={ITEM_CLASS}
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            className={ITEM_CLASS}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
