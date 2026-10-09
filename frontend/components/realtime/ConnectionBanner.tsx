import type { ConnectionStatus } from "@/lib/realtime/stompSession";

const LABELS: Partial<Record<ConnectionStatus, string>> = {
  connecting: "Connecting…",
  reconnecting: "Connection lost. Reconnecting…",
  disconnected: "Disconnected. Retrying in the background…",
};

/** Connection-state banner; the live region stays mounted so changes are announced. */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const label = LABELS[status];
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed top-2 left-1/2 z-50 -translate-x-1/2"
    >
      {label && (
        <div
          className={`rounded-md px-3 py-1 text-sm shadow ${
            status === "disconnected"
              ? "bg-red-100 text-red-900"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          {label}
        </div>
      )}
    </div>
  );
}
