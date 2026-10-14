import type { ConnectionStatus } from "@/lib/realtime/stompSession";

interface AirState {
  /** Visible label, set in the header like a station's on-air sign. */
  label: string;
  /** What a screen reader hears when the state changes. */
  announcement: string;
  tone: "live" | "pending" | "off";
}

const STATES: Partial<Record<ConnectionStatus, AirState>> = {
  connected: { label: "On air", announcement: "Connected", tone: "live" },
  connecting: { label: "Connecting…", announcement: "Connecting…", tone: "pending" },
  reconnecting: {
    label: "Reconnecting…",
    announcement: "Connection lost. Reconnecting…",
    tone: "pending",
  },
  disconnected: {
    label: "Off air · retrying",
    announcement: "Disconnected. Retrying in the background…",
    tone: "off",
  },
};

const DOT_CLASS: Record<AirState["tone"], string> = {
  live: "bg-spot-on-shell shadow-[0_0_0_3px] shadow-spot-on-shell/25",
  pending: "bg-warning-on-shell motion-safe:animate-pulse",
  off: "border border-shell-muted bg-transparent",
};

/**
 * Connection state in the app header (CM-084: replaces the floating banner).
 * The live region stays mounted so every change is announced.
 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const state = STATES[status];
  return (
    <div role="status" aria-live="polite" className="flex min-w-0 items-center">
      {state && (
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-shell-foreground">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${DOT_CLASS[state.tone]}`} aria-hidden="true" />
          <span aria-hidden="true" className="truncate">{state.label}</span>
          <span className="sr-only">{state.announcement}</span>
        </span>
      )}
    </div>
  );
}
