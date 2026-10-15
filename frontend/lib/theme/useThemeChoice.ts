"use client";

import { useSyncExternalStore } from "react";
import { readThemeChoice, setThemeChoice, subscribeTheme, type ThemeChoice } from "./theme";

/** The current theme choice and a setter; "system" on the server. */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribeTheme, readThemeChoice, () => "system" as const);
  return [choice, setThemeChoice];
}
