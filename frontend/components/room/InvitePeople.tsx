"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import toast from "react-hot-toast";
import { UserAvatar } from "@/components/common/UserAvatar";
import { invitationApi } from "@/lib/api/invitationApi";
import { useUsersStore } from "@/lib/stores/usersStore";
import { UserSummaryResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InvitePeopleProps {
  roomId: string | null;
  /** People who must not be offered (members, the caller, people already invited). */
  excludeIds: string[];
  /** Called after the send with the people who were invited successfully. */
  onSent?: (invited: UserSummaryResponse[]) => void;
  /** Label of the send button. */
  sendLabel?: string;
  /** Extra action beside the send button (for example "Skip"). */
  secondary?: React.ReactNode;
}

/**
 * Pick people and send them invitations to a PRIVATE room (SPEC-009 AC-009-1). Each invitation is its own request, so one
 * failure (already a member, blocked, room full) does not stop the others; the result is summarised once.
 */
export function InvitePeople({ roomId, excludeIds, onSent, sendLabel = "Send invitations", secondary }: InvitePeopleProps) {
  const searchQuery = useUsersStore((state) => state.searchQuery);
  const setSearchQuery = useUsersStore((state) => state.setSearchQuery);
  const filteredUsers = useUsersStore((state) => state.filteredUsers);
  const loading = useUsersStore((state) => state.loading);
  const [selected, setSelected] = useState<UserSummaryResponse[]>([]);
  const [sending, setSending] = useState(false);

  // Start every picker with an empty search; the store is shared with other user searches.
  useEffect(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return filteredUsers.filter((user) => !excludeIds.includes(user.id)).slice(0, 8);
  }, [filteredUsers, excludeIds, searchQuery]);

  const toggle = (user: UserSummaryResponse) =>
    setSelected((list) => (list.some((u) => u.id === user.id) ? list.filter((u) => u.id !== user.id) : [...list, user]));

  const send = async () => {
    if (!roomId || selected.length === 0) return;
    setSending(true);
    const outcomes = await Promise.allSettled(selected.map((user) => invitationApi.invite(roomId, user.id)));
    setSending(false);
    const invited = selected.filter((_, index) => outcomes[index].status === "fulfilled");
    const failed = outcomes.flatMap((outcome, index) =>
      outcome.status === "rejected" ? [`${selected[index].name}: ${(outcome.reason as Error)?.message || "failed"}`] : []
    );
    if (invited.length > 0) {
      toast.success(invited.length === 1 ? `Invited ${invited[0].name}` : `Invited ${invited.length} people`);
    }
    if (failed.length > 0) toast.error(failed.join("\n"));
    setSelected((list) => list.filter((user) => !invited.some((i) => i.id === user.id)));
    onSent?.(invited);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search people to invite"
          placeholder="Search people by name…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-muted/50 pr-3 pl-10 text-sm transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-[3px] focus:ring-ring/20 focus:outline-none"
        />
      </div>

      <div aria-live="polite" className="flex min-h-9 flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {selected.map((user) => (
            <motion.button
              key={user.id}
              type="button"
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => toggle(user)}
              aria-label={`Remove ${user.name}`}
              className="flex items-center gap-1.5 rounded-full bg-primary/12 py-1 pr-2 pl-1 text-sm font-medium text-foreground ring-1 ring-primary/30 hover:bg-primary/20"
            >
              <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
              {user.name}
              <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </motion.button>
          ))}
        </AnimatePresence>
        {selected.length === 0 && (
          <p className="self-center text-xs text-muted-foreground">Nobody picked yet. Search above and tap a name.</p>
        )}
      </div>

      <ul className="max-h-60 space-y-0.5 overflow-y-auto" aria-label="Search results" aria-busy={loading}>
        {searchQuery.trim() && !loading && results.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">No one found for “{searchQuery}”.</li>
        )}
        {results.map((user) => {
          const picked = selected.some((u) => u.id === user.id);
          return (
            <li key={user.id}>
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => toggle(user)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent",
                  picked && "bg-accent"
                )}
              >
                <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="lg" />
                <span className="min-w-0 flex-1 truncate font-medium">{user.name}</span>
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border transition-colors",
                    picked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  )}
                  aria-hidden="true"
                >
                  {picked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        {secondary}
        <button
          type="button"
          onClick={() => void send()}
          disabled={!roomId || selected.length === 0 || sending}
          className="h-11 flex-1 rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to px-4 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_-8px_rgb(11_107_93/0.7)] transition-transform hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending…" : selected.length > 1 ? `${sendLabel} (${selected.length})` : sendLabel}
        </button>
      </div>
    </div>
  );
}
