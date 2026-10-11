"use client";
import React from "react";
import { AlertCircle, Globe, RotateCw, Search, Users } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useDiscoverRoomsStore } from "@/lib/stores/discoverRoomsStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export const DiscoverRoomsDialog: React.FC = () => {
  const {
    isOpen,
    query,
    results,
    hasMore,
    loading,
    loadingMore,
    error,
    joinError,
    joiningId,
    close,
    setQuery,
    search,
    loadMore,
    join,
  } = useDiscoverRoomsStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      query: state.query,
      results: state.results,
      hasMore: state.hasMore,
      loading: state.loading,
      loadingMore: state.loadingMore,
      error: state.error,
      joinError: state.joinError,
      joiningId: state.joiningId,
      close: state.close,
      setQuery: state.setQuery,
      search: state.search,
      loadMore: state.loadMore,
      join: state.join,
    }))
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Discover rooms</DialogTitle>
          <DialogDescription>
            Find public rooms you have not joined yet.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search public rooms"
            placeholder="Search public rooms..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {joinError && (
          <div
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            role="alert"
          >
            {joinError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div
              className="space-y-3"
              role="status"
              aria-busy="true"
              aria-label="Loading public rooms"
            >
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div
              className="p-4 bg-red-50 border border-red-200 rounded-lg"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => (results.length > 0 ? loadMore() : search())}
                className="mt-3 inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100"
              >
                <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center">
              <Globe className="w-10 h-10 text-gray-400 mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-900">
                No public rooms found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {query.trim()
                  ? "Try adjusting your search terms"
                  : "There are no public rooms to join right now"}
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {results.map((room) => (
                <li key={room.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {room.name}
                    </p>
                    {room.description && (
                      <p className="text-xs text-gray-500 truncate">
                        {room.description}
                      </p>
                    )}
                    <p className="flex items-center text-xs text-gray-500 mt-0.5">
                      <Users className="w-3 h-3 mr-1" aria-hidden="true" />
                      {room.maxMembers > 0
                        ? `${room.memberCount} / ${room.maxMembers} members`
                        : `${room.memberCount} members`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={joiningId !== null}
                    aria-label={`Join ${room.name}`}
                    onClick={() => join(room.id)}
                  >
                    {joiningId === room.id ? "Joining..." : "Join"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!loading && hasMore && (
            <div className="pt-3 text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => loadMore()}
              >
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
