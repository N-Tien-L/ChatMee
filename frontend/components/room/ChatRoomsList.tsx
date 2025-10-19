"use client";
import React, { Suspense } from "react";
import { RoomType } from "@/lib/type/CoreModelsAndEnum";
import { Search, Plus, MessageSquare, Users, Lock, Globe } from "lucide-react";
import ChatRoomListItem from "./ChatRoomListItem";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useShallow } from "zustand/react/shallow";
import { useRouter, useSearchParams } from "next/navigation";

interface ChatRoomsListProps {
  onCloseSidebar?: () => void;
}

const ChatRoomsListContent: React.FC<ChatRoomsListProps> = ({
  onCloseSidebar,
}) => {
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
    joinRoom,
    leaveRoom,
    deleteRoomById,
    openCreateRoomModal,
  } = useChatRoomsStore(
    useShallow((state) => ({
      filteredRooms: state.filteredRooms,
      loading: state.loading,
      error: state.error,
      searchQuery: state.searchQuery,
      roomTypeFilter: state.roomTypeFilter,
      setSearchQuery: state.setSearchQuery,
      setRoomTypeFilter: state.setRoomTypeFilter,
      joinRoom: state.joinRoom,
      leaveRoom: state.leaveRoom,
      deleteRoomById: state.deleteRoomById,
      openCreateRoomModal: state.openCreateRoomModal,
    }))
  );

  const handleRoomClick = (roomId: string) => {
    router.push(`/dashboard?roomId=${roomId}`, { scroll: false });
    if (onCloseSidebar) onCloseSidebar(); // Close sidebar on mobile
  };

  const roomTypeOptions = [
    { value: "ALL", label: "All", icon: MessageSquare },
    { value: RoomType.PUBLIC, label: "Public", icon: Globe },
    { value: RoomType.PRIVATE, label: "Private", icon: Lock },
    { value: RoomType.DIRECT_MESSAGE, label: "Direct", icon: Users },
  ];

  return (
    <div className="h-full flex flex-col bg-white border-r min-w-0 w-full overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b flex-shrink-0 sticky top-0 bg-white z-10">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            Chats
          </h2>
          <button
            onClick={() => openCreateRoomModal()}
            className="p-1.5 sm:p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors flex-shrink-0"
            title="Create new chat room"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filter Tabs */}
        <div className="mt-2 sm:mt-3 grid grid-cols-4 gap-1">
          {roomTypeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setRoomTypeFilter(value as RoomType | "ALL")}
              className={`flex items-center justify-center py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                roomTypeFilter === value
                  ? "bg-blue-100 text-blue-700 border border-blue-200"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1.5" />
              <span className="hidden sm:inline truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rooms List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {error && (
          <div className="p-4 mx-4 mt-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && filteredRooms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquare className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mb-3" />
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
              No chat rooms found
            </h3>
            <p className="text-gray-500 text-xs sm:text-sm mb-4 max-w-xs">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Create your first chat room to get started"}
            </p>
            <button
              onClick={() => openCreateRoomModal()}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Create Chat Room
            </button>
          </div>
        )}

        {!loading && !error && filteredRooms.length > 0 && (
          <div className="divide-y divide-gray-100">
            {filteredRooms.map((room) => (
              <ChatRoomListItem
                key={room.id}
                room={room}
                onJoin={() => joinRoom(room.id)}
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
      <div className="p-2 sm:p-4 border-t bg-gray-50 flex-shrink-0 text-center">
        <p className="text-xs text-gray-500">
          {filteredRooms.length} {filteredRooms.length === 1 ? "room" : "rooms"}
        </p>
      </div>
    </div>
  );
};

const ChatRoomsList = (props: ChatRoomsListProps) => (
  <Suspense
    fallback={
      <div className="border-r bg-white h-full flex items-center justify-center text-gray-500">
        Loading...
      </div>
    }
  >
    <ChatRoomsListContent {...props} />
  </Suspense>
);

export default ChatRoomsList;
