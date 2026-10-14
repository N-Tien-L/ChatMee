"use client";
import React, { Suspense, useEffect } from "react";
import { RoomType } from "@/lib/types";
import {
  Search,
  MessageSquare,
  MessageSquarePlus,
  Users,
  UsersRound,
  AlertCircle,
  RotateCw,
  Compass,
} from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import ChatRoomListItem from "./ChatRoomListItem";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useDiscoverRoomsStore } from "@/lib/stores/discoverRoomsStore";
import { DiscoverRoomsDialog } from "./DiscoverRoomsDialog";
import { useShallow } from "zustand/react/shallow";
import { useRouter, useSearchParams } from "next/navigation";

const APP_TITLE = "ChatMee";

const ChatRoomsListContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRoomId = searchParams.get("roomId");

  const {
    filteredRooms,
    loading,
    error,
    searchQuery,
    roomTypeFilter,
    setSearchQuery,
    setRoomTypeFilter,
    leaveRoom,
    deleteRoomById,
    openCreateRoomModal,
    fetchRooms,
    setActiveRoom,
    markRoomRead,
    unreadTotal,
  } = useChatRoomsStore(
    useShallow((state) => ({
      filteredRooms: state.filteredRooms,
      loading: state.loading,
      error: state.error,
      searchQuery: state.searchQuery,
      roomTypeFilter: state.roomTypeFilter,
      setSearchQuery: state.setSearchQuery,
      setRoomTypeFilter: state.setRoomTypeFilter,
      leaveRoom: state.leaveRoom,
      deleteRoomById: state.deleteRoomById,
      openCreateRoomModal: state.openCreateRoomModal,
      fetchRooms: state.fetchRooms,
      setActiveRoom: state.setActiveRoom,
      markRoomRead: state.markRoomRead,
      unreadTotal: state.rooms.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0),
    }))
  );

  const openDiscoverRooms = useDiscoverRoomsStore((state) => state.open);

  const handleRoomClick = (roomId: string) => {
    router.push(`/dashboard?roomId=${roomId}`, { scroll: false });
  };

  // The open room drives the unread rules; opening it (or returning to the tab) marks it read.
  useEffect(() => {
    setActiveRoom(selectedRoomId);
    if (selectedRoomId && document.visibilityState === "visible") {
      void markRoomRead(selectedRoomId);
    }
    const onVisible = () => {
      if (selectedRoomId && document.visibilityState === "visible") {
        void markRoomRead(selectedRoomId);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      setActiveRoom(null);
    };
  }, [selectedRoomId, setActiveRoom, markRoomRead]);

  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = APP_TITLE;
    };
  }, [unreadTotal]);

  const roomTypeOptions = [
    { value: "ALL", label: "All", icon: MessageSquare },
    { value: RoomType.DIRECT_MESSAGE, label: "Direct", icon: Users },
  ];

  return (
    <div className="h-full flex flex-col bg-sidebar min-w-0 w-full overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3.5 pb-3 sm:px-4 border-b flex-shrink-0 sticky top-0 bg-sidebar z-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-foreground">
            Chats
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openDiscoverRooms()}
              className="p-1.5 sm:p-2 rounded-md border border-border text-foreground hover:bg-accent transition-colors flex-shrink-0"
              title="Discover rooms"
              aria-label="Discover rooms"
            >
              <Compass className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => openCreateRoomModal()}
              className="p-1.5 sm:p-2 rounded-md border border-border text-foreground hover:bg-accent transition-colors flex-shrink-0"
              title="New group"
              aria-label="New group"
            >
              <UsersRound className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => openCreateRoomModal()}
              className="p-1.5 sm:p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0"
              title="New message"
              aria-label="New message"
            >
              <MessageSquarePlus className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search chats"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-sm border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {/* Filter Tabs */}
        <div
          className="mt-2 sm:mt-3 grid grid-cols-2 gap-1"
          role="group"
          aria-label="Filter by room type"
        >
          {roomTypeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setRoomTypeFilter(value as RoomType | "ALL")}
              aria-label={label}
              aria-pressed={roomTypeFilter === value}
              className={`flex items-center justify-center py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                roomTypeFilter === value
                  ? "bg-accent text-accent-foreground border border-primary/30"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon
                className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1.5"
                aria-hidden="true"
              />
              <span className="hidden sm:inline truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rooms List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div
            className="divide-y divide-border/60"
            role="status"
            aria-busy="true"
            aria-label="Loading chat rooms"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 sm:p-4">
                <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div
            className="p-4 mx-4 mt-4 bg-danger-surface border border-destructive/30 rounded-md"
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
              onClick={() => fetchRooms()}
              className="mt-3 inline-flex items-center px-3 py-1.5 text-sm font-medium text-destructive bg-card border border-destructive/30 rounded-md hover:bg-danger-surface"
            >
              <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filteredRooms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquare
              className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mb-3"
              aria-hidden="true"
            />
            <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
              No chat rooms found
            </h3>
            <p className="text-muted-foreground text-xs sm:text-sm mb-4 max-w-xs">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Create your first chat room to get started"}
            </p>
            <button
              onClick={() => openCreateRoomModal()}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Create Chat Room
            </button>
          </div>
        )}

        {!loading && !error && filteredRooms.length > 0 && (
          <div className="divide-y divide-border/60">
            {filteredRooms.map((room) => (
              <ChatRoomListItem
                key={room.id}
                room={room}
                onLeave={() => leaveRoom(room.id)}
                onDelete={() => deleteRoomById(room.id)}
                onClick={() => handleRoomClick(room.id)}
                isSelected={selectedRoomId === room.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t flex-shrink-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] tabular text-muted-foreground">
          {filteredRooms.length} {filteredRooms.length === 1 ? "room" : "rooms"}
        </p>
      </div>
      <DiscoverRoomsDialog />
    </div>
  );
};

const ChatRoomsList = () => (
  <Suspense
    fallback={
      <div className="border-r bg-card h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    }
  >
    <ChatRoomsListContent />
  </Suspense>
);

export default ChatRoomsList;
