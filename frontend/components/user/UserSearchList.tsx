import { useUsersStore } from "@/lib/stores";
import { UserResponse } from "@/lib/type/ResponseType";
import { Search, User } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import UserSearchItem from "./UserSearchItem";

interface UserSearchListProps {
  onUserAdd: (user: UserResponse) => void;
  excludeUserIds?: string[];
  placeHolder?: string;
}

const UserSearchList = ({
  onUserAdd,
  excludeUserIds = [],
  placeHolder = "Search user by name or email...",
}: UserSearchListProps) => {
  const { users, loading, searchQuery, filteredUsers, setSearchQuery } =
    useUsersStore(
      useShallow((state) => ({
        users: state.users,
        loading: state.loading,
        searchQuery: state.searchQuery,
        filteredUsers: state.filteredUsers,
        setSearchQuery: state.setSearchQuery,
      }))
    );
  const fetchUSers = useUsersStore((state) => state.fetchUsers);
  const [addedUserIds, setAddedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (users.length === 0) {
      fetchUSers();
    }
  }, [users.length, fetchUSers]);

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

  const handleAddUser = (user: UserResponse) => {
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
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder={placeHolder}
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-10 pr-4 py-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      {/* Search Results */}
      <div className="max-h-80 overflow-y-auto space-y-2">
        {loading ? (
          // Loading State
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                    <div className="w-16 h-8 bg-gray-200 rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !searchQuery.trim() ? (
          // Initial State
          <div className="text-center py-8 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Start typing to search for users</p>
          </div>
        ) : displayUsers.length === 0 ? (
          // No Results State
          <div className="text-center py-8 text-gray-500">
            <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">
              No users found matching &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Try searching with a different name or email
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
            />
          ))
        )}
      </div>

      {/* Results Count */}
      {searchQuery.trim() && !loading && displayUsers.length > 0 && (
        <div className="text-xs text-gray-500 text-center">
          Found {displayUsers.length} user{displayUsers.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

export default UserSearchList;
