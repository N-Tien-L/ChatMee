"use client";

import { useSyncExternalStore } from "react";
import { subscribeTheme } from "./theme";

/** Whether the resolved workspace theme is dark right now (follows the menu choice and the OS setting). */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false
  );
}
