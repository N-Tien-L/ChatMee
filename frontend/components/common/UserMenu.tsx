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

/** Where focus goes when the menu opens from the keyboard: the first or last item. Mouse opening leaves focus alone. */
type FocusTarget = "first" | "last" | null;

const menuItems = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);

const focusMenuEdge = (menu: HTMLElement | null, target: Exclude<FocusTarget, null>) => {
  const list = menuItems(menu);
  (target === "first" ? list[0] : list[list.length - 1])?.focus();
};

/**
 * Account menu: a menu button (WAI-ARIA APG). Kept as a plain absolutely positioned panel inside the header rather than
 * a portalled primitive so it stacks above the workspace on mobile (CM-084). Keyboard: Enter, Space or ArrowDown on the
 * trigger opens it on the first item, ArrowUp on the last; ArrowUp/ArrowDown move with wrap-around, Home/End jump to the
 * ends, Escape closes and returns focus to the trigger.
 */
export function UserMenu({ user, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const focusTargetRef = useRef<FocusTarget>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useThemeChoice();

  const items = () => menuItems(menuRef.current);
  const focusEdge = (target: Exclude<FocusTarget, null>) => focusMenuEdge(menuRef.current, target);

  // The items exist only after the open render, so keyboard opening focuses them here.
  useEffect(() => {
    const target = focusTargetRef.current;
    if (!open || !target) return;
    focusTargetRef.current = null;
    focusMenuEdge(menuRef.current, target);
  }, [open]);

  const openWithFocus = (target: Exclude<FocusTarget, null>) => {
    if (open) {
      focusEdge(target);
      return;
    }
    focusTargetRef.current = target;
    setOpen(true);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        // preventDefault also stops the native click, so the toggle below does not close it again.
        event.preventDefault();
        openWithFocus("first");
        break;
      case "ArrowUp":
        event.preventDefault();
        openWithFocus("last");
        break;
      default:
        break;
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        next = index < 0 ? 0 : (index + 1) % list.length;
        break;
      case "ArrowUp":
        next = index < 0 ? list.length - 1 : (index - 1 + list.length) % list.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = list.length - 1;
        break;
      case " ":
        // Buttons activate on Space natively; the Profile link does not.
        if (event.target instanceof HTMLAnchorElement) {
          event.preventDefault();
          event.target.click();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    list[next]?.focus();
  };

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
        onKeyDown={handleTriggerKeyDown}
        // Firefox clicks a button on Space keyup even when keydown was prevented; the keydown already opened the menu.
        onKeyUp={(event) => {
          if (event.key === " ") event.preventDefault();
        }}
        className="rounded-full focus-visible:outline-2 focus-visible:outline-shell-foreground"
      >
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
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
