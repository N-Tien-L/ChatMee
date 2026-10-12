import Link from "next/link";
import { UserMenu } from "./UserMenu";

interface AppHeaderProps {
  user: { name: string; avatarUrl?: string | null } | null;
  onSignOut: () => void;
}

export function AppHeader({ user, onSignOut }: AppHeaderProps) {
  return (
    <header className="z-10 flex h-14 flex-shrink-0 items-center border-b bg-background px-4">
      <Link href="/dashboard" className="font-brand text-xl text-primary">
        ChatMee
      </Link>
      <div className="ml-auto">
        {user && <UserMenu user={user} onSignOut={onSignOut} />}
      </div>
    </header>
  );
}
