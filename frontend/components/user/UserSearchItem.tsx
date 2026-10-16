import { UserSummaryResponse } from "@/lib/types";
import React from "react";
import { ArrowRight, Ban, Check } from "lucide-react";
import { UserAvatar } from "@/components/common/UserAvatar";

export interface UserSearchItemProps {
  user: UserSummaryResponse;
  onAdd: () => void;
  isAdded: boolean;
  /** Verb on the row's action, for example "Message" or "Add". */
  actionLabel?: string;
  /** Optional second action: block this person (SPEC-009 AC-009-15). */
  onBlock?: () => void;
}

/** One person in a search result: the whole row is the action, with an optional Block button beside it. */
const UserSearchItem = ({ user, onAdd, isAdded, actionLabel = "Add", onBlock }: UserSearchItemProps) => {
  const row = (
  <button
    type="button"
    onClick={onAdd}
    disabled={isAdded}
    aria-label={`${actionLabel} ${user.name}`}
    className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
  >
    <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="lg" />
    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{user.name}</span>
    {isAdded ? (
      <span className="flex items-center gap-1 text-xs font-medium text-success">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Done
      </span>
    ) : (
      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary opacity-80 transition-opacity group-hover:opacity-100">
        {actionLabel}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    )}
  </button>
  );
  if (!onBlock) return row;
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">{row}</div>
      <button
        type="button"
        onClick={onBlock}
        aria-label={`Block ${user.name}`}
        title="Block"
        className="flex-shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
      >
        <Ban className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default UserSearchItem;
