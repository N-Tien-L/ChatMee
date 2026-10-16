"use client";
import React from "react";
import { AlertCircle, Globe, RotateCw, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

  const joinAndOpen = async (roomId: string) => {
    if (!(await join(roomId))) return;
    close();
    router.push(`/dashboard?roomId=${roomId}`, { scroll: false });
  };

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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search public rooms"
            placeholder="Search public rooms..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {joinError && (
          <div
            className="p-3 bg-danger-surface border border-destructive/30 rounded-lg text-sm text-destructive"
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
              className="p-4 bg-danger-surface border border-destructive/30 rounded-lg"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <p className="text-destructive text-sm">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => (results.length > 0 ? loadMore() : search())}
                className="mt-3 inline-flex items-center px-3 py-1.5 text-sm font-medium text-destructive bg-card border border-destructive/30 rounded-lg hover:bg-danger-surface"
              >
                <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center">
              <Globe className="w-10 h-10 text-muted-foreground mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">
                No public rooms found
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {query.trim()
                  ? "Try adjusting your search terms"
                  : "There are no public rooms to join right now"}
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul className="divide-y divide-border/60">
              {results.map((room) => (
                <li key={room.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {room.name}
                    </p>
                    {room.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {room.description}
                      </p>
                    )}
                    <p className="flex items-center text-xs text-muted-foreground mt-0.5">
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
                    onClick={() => void joinAndOpen(room.id)}
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
