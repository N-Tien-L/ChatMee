/** Workspace theme (D-15): the user's choice is kept in the browser; "system" follows the operating system. */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "chatmee-theme";
const THEME_EVENT = "chatmee-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The OS dark-mode query, or null where matchMedia does not exist (old browsers, test environments). */
function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage can be blocked (private mode); fall back to the system setting.
  }
  return "system";
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return darkQuery()?.matches ? "dark" : "light";
}

/** Puts the resolved theme on <html> (the `dark` class drives the tokens and Tailwind's `dark:` variant). */
export function applyTheme(choice: ThemeChoice): void {
  const theme = resolveTheme(choice);
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Not remembered, but still applied for this page view.
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Re-applies on choice changes (this tab) and on operating-system changes while the choice is "system". */
export function subscribeTheme(onChange: () => void): () => void {
  const media = darkQuery();
  const onSystem = () => {
    if (readThemeChoice() === "system") applyTheme("system");
    onChange();
  };
  media?.addEventListener("change", onSystem);
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onSystem);
  return () => {
    media?.removeEventListener("change", onSystem);
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onSystem);
  };
}

/** Runs before first paint (inline in <head>) so a dark page never flashes light. Keep in sync with applyTheme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_STORAGE_KEY}");var d=c==="dark"||((c!=="light")&&matchMedia("${DARK_QUERY}").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
