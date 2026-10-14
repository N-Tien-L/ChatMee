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
    <header className="z-10 flex h-[52px] flex-shrink-0 items-center gap-4 bg-shell px-3 text-shell-foreground sm:gap-6 sm:px-5">
      <Link
        href="/dashboard"
        className="rounded-sm pt-2 font-brand text-[22px] leading-none text-primary-foreground focus-visible:outline-shell-foreground"
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
