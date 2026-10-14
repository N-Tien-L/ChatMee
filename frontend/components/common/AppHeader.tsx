import type { ReactNode } from "react";
import Link from "next/link";
import { UserMenu } from "./UserMenu";

interface AppHeaderProps {
  user: { name: string; avatarUrl?: string | null } | null;
  onSignOut: () => void;
  /** Connection state shown beside the wordmark. */
  status?: ReactNode;
}

/** The inked band across the workspace: wordmark, connection state, account menu. */
export function AppHeader({ user, onSignOut, status }: AppHeaderProps) {
  return (
    <header className="relative z-10 flex h-14 flex-shrink-0 items-center gap-4 bg-shell bg-[radial-gradient(ellipse_60%_140%_at_15%_0%,rgb(46_230_193/0.18),transparent_70%)] px-3 text-shell-foreground sm:gap-6 sm:px-5">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-glow/50 to-transparent" />
      <Link
        href="/dashboard"
        className="rounded-sm pt-2 font-brand text-[24px] leading-none text-shell-foreground focus-visible:outline-shell-foreground"
      >
        ChatMee
      </Link>
      {status}
      <div className="ml-auto">
        {user && <UserMenu user={user} onSignOut={onSignOut} />}
      </div>
    </header>
  );
}
