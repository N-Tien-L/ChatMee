import { UserSummaryResponse } from "@/lib/types";
import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { UserAvatar } from "@/components/common/UserAvatar";

export interface UserSearchItemProps {
  user: UserSummaryResponse;
  onAdd: () => void;
  isAdded: boolean;
  /** Verb on the row's action, for example "Message" or "Add". */
  actionLabel?: string;
}

/** One person in a search result: the whole row is the action. */
const UserSearchItem = ({ user, onAdd, isAdded, actionLabel = "Add" }: UserSearchItemProps) => (
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

export default UserSearchItem;
