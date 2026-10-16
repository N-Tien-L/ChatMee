import { useUsersStore } from "@/lib/stores";
import { UserSummaryResponse } from "@/lib/types";
import { AlertCircle, LoaderCircle, RotateCw, Search, User } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import UserSearchItem from "./UserSearchItem";

interface UserSearchListProps {
  onUserAdd: (user: UserSummaryResponse) => void;
  excludeUserIds?: string[];
  placeHolder?: string;
  /** Verb shown on each result, for example "Message". */
  actionLabel?: string;
  /** Shows a Block action on each result. */
  onUserBlock?: (user: UserSummaryResponse) => void;
}

// Stable default: a new [] on every render would re-run the excludeUserIds effect forever.
const NO_EXCLUDED_USERS: string[] = [];

const UserSearchList = ({
  onUserAdd,
  excludeUserIds = NO_EXCLUDED_USERS,
  placeHolder = "Search user by name...",
  actionLabel,
  onUserBlock,
}: UserSearchListProps) => {
  const { users, loading, error, searchQuery, filteredUsers, setSearchQuery } =
    useUsersStore(
      useShallow((state) => ({
        users: state.users,
        loading: state.loading,
        error: state.error,
        searchQuery: state.searchQuery,
        filteredUsers: state.filteredUsers,
        setSearchQuery: state.setSearchQuery,
      }))
    );
  const fetchUsers = useUsersStore((state) => state.fetchUsers);
  const [addedUserIds, setAddedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (users.length === 0) {
      fetchUsers();
    }
  }, [users.length, fetchUsers]);

  // Reset addedUserIds when excludeUserIds changes (user removed from selection)
  useEffect(() => {
    // Remove any user from addedUserIds that is no longer in excludeUserIds
    // This handles the case where a user was added, then removed from selection
    setAddedUserIds((prev) => {
      const newAddedIds = new Set<string>();
      prev.forEach((userId) => {
        // Keep the user in addedUserIds only if they're still excluded
        if (excludeUserIds.includes(userId)) {
          newAddedIds.add(userId);
        }
      });
      return newAddedIds;
    });
  }, [excludeUserIds]);

  const displayUsers = useMemo(() => {
    if (!searchQuery.trim()) return [];

    return filteredUsers.filter((user) => {
      return !excludeUserIds.includes(user.id) && !addedUserIds.has(user.id);
    });
  }, [filteredUsers, excludeUserIds, addedUserIds, searchQuery]);

  const handleAddUser = (user: UserSummaryResponse) => {
    onUserAdd(user);
    setAddedUserIds((prev) => new Set([...prev, user.id]));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search users"
          placeholder={placeHolder}
          value={searchQuery}
          onChange={handleSearchChange}
          className="h-11 rounded-xl pl-10 pr-10 border-border focus:border-ring focus:ring-ring"
        />
        <span
          hidden={!loading}
          role="status"
          aria-busy={loading}
          aria-label="Searching users"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </span>
      </div>

      {/* Search Results */}
      {/* Reserve the same result space in every state so centred dialogs do not jump. */}
      <fieldset
        disabled={loading}
        aria-busy={loading}
        aria-label="User search results"
        className="min-w-0 h-72 max-h-[40dvh] overflow-y-auto space-y-0.5 [scrollbar-gutter:stable]"
      >
        {error ? (
          // Error State
          <div className="text-center py-8 text-muted-foreground" role="alert">
            <AlertCircle
              className="w-10 h-10 mx-auto mb-3 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => fetchUsers(searchQuery)}
            >
              <RotateCw className="w-4 h-4 mr-2" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : !searchQuery.trim() ? (
          // Initial State
          <div className="text-center py-8 text-muted-foreground">
            <Search
              className="w-12 h-12 mx-auto mb-3 text-border"
              aria-hidden="true"
            />
            <p className="text-sm">Start typing to search for users</p>
          </div>
        ) : displayUsers.length === 0 ? (
          // No Results State
          <div className="text-center py-8 text-muted-foreground">
            <User
              className="w-12 h-12 mx-auto mb-3 text-border"
              aria-hidden="true"
            />
            <p className="text-sm">
              No users found matching &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Try searching with a different name
            </p>
          </div>
        ) : (
          // Results List
          displayUsers.map((user) => (
            <UserSearchItem
              key={user.id}
              user={user}
              onAdd={() => handleAddUser(user)}
              isAdded={addedUserIds.has(user.id)}
              actionLabel={actionLabel}
              onBlock={onUserBlock ? () => onUserBlock(user) : undefined}
            />
          ))
        )}
        {/* Keep the count inside the reserved area; it must not resize the dialog. */}
        {searchQuery.trim() && !error && displayUsers.length > 0 && (
          <div className="pt-3 text-xs text-muted-foreground text-center" role="status">
            Found {displayUsers.length} user{displayUsers.length !== 1 ? "s" : ""}
          </div>
        )}
      </fieldset>
    </div>
  );
};

export default UserSearchList;
