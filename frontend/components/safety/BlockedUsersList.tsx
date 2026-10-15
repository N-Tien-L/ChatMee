"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useUsersStore } from "@/lib/stores/usersStore";

/** The caller's blocks with Unblock (SPEC-009 AC-009-15, AC-009-19: unblocking restores the DM). */
export function BlockedUsersList() {
  const blockedUsers = useUsersStore((state) => state.blockedUsers);
  const blocksError = useUsersStore((state) => state.blocksError);
  const fetchBlocks = useUsersStore((state) => state.fetchBlocks);
  const unblockUser = useUsersStore((state) => state.unblockUser);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchBlocks();
  }, [fetchBlocks]);

  const unblock = async (id: string, name: string) => {
    setPendingId(id);
    await unblockUser({ id, name });
    setPendingId(null);
  };

  return (
    <section aria-labelledby="blocked-people" className="space-y-3">
      <h2 id="blocked-people" className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        Blocked people
      </h2>
      {blocksError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            {blocksError}
          </span>
          <Button variant="outline" size="sm" onClick={() => void fetchBlocks()}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : blockedUsers === null ? (
        <div role="status" aria-busy="true" aria-label="Loading blocked people">
          <Skeleton className="h-12 w-full" />
        </div>
      ) : blockedUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have not blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {blockedUsers.map((blocked) => (
            <li key={blocked.id} className="flex items-center gap-3 px-4 py-2.5">
              <UserAvatar name={blocked.name} avatarUrl={blocked.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{blocked.name}</p>
                <p className="text-xs text-muted-foreground">
                  Blocked <RelativeTime value={blocked.blockedAt} />
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pendingId === blocked.id}
                onClick={() => void unblock(blocked.id, blocked.name)}
                aria-label={`Unblock ${blocked.name}`}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
