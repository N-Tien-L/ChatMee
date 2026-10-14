"use client";

import Link from "next/link";
import { Check, LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { useThemeChoice } from "@/lib/theme/useThemeChoice";
import type { ThemeChoice } from "@/lib/theme/theme";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "./UserAvatar";

interface UserMenuProps {
  user: { name: string; avatarUrl?: string | null };
  onSignOut: () => void;
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

const ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent focus-visible:bg-accent";

export function UserMenu({ user, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useThemeChoice();

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
          <div role="group" aria-label="Theme" className="my-1 border-y border-border py-1">
            <p className="px-2 pt-1 pb-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Theme</p>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={theme === value}
                className={ITEM_CLASS}
                onClick={() => setTheme(value)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {theme === value && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
              </button>
            ))}
          </div>
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
