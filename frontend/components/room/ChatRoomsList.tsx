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
  Hash,
} from "lucide-react";
import { motion } from "motion/react";
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
    { value: "ROOMS", label: "Rooms", icon: Hash },
    { value: RoomType.DIRECT_MESSAGE, label: "Direct", icon: Users },
  ];

  return (
    <div className="h-full flex flex-col bg-sidebar min-w-0 w-full overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-4 pb-3 sm:px-4 flex-shrink-0 sticky top-0 bg-sidebar z-10">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">
            Chats
          </h2>
          <button
            type="button"
            onClick={() => openDiscoverRooms()}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
            title="Discover rooms"
            aria-label="Discover rooms"
          >
            <Compass className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span aria-hidden="true">Discover</span>
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openCreateRoomModal("direct")}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_-10px_rgb(11_107_93/0.8)] transition-transform hover:brightness-110 active:scale-[0.98]"
            aria-label="New message"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            <span aria-hidden="true">Message</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateRoomModal("room")}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-accent active:scale-[0.98]"
            aria-label="New room"
          >
            <UsersRound className="h-4 w-4 text-primary" aria-hidden="true" />
            <span aria-hidden="true">Room</span>
          </button>
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
            placeholder="Search chats"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-muted/60 py-2 pl-9 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-ring/20"
          />
        </div>

        {/* Filter Tabs */}
        <div
          className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
          role="group"
          aria-label="Filter by room type"
        >
          {roomTypeOptions.map(({ value, label, icon: Icon }) => {
            const active = roomTypeFilter === value;
            return (
              <button
                key={value}
                onClick={() => setRoomTypeFilter(value as RoomType | "ALL" | "ROOMS")}
                aria-label={label}
                aria-pressed={active}
                className={`relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="room-filter-indicator"
                    className="absolute inset-0 rounded-lg bg-card shadow-sm ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <Icon className="relative h-3.5 w-3.5" aria-hidden="true" />
                <span className="relative">{label}</span>
              </button>
            );
          })}
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
              onClick={() => openCreateRoomModal("room")}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Create a room
            </button>
          </div>
        )}

        {!loading && !error && filteredRooms.length > 0 && (
          <div className="space-y-0.5 px-2 pb-2">
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
