import React, { Suspense } from "react";
import { RoomType } from "@/lib/type/CoreModelsAndEnum";
import { Search, Plus, MessageSquare, Users, Lock, Globe } from "lucide-react";
import ChatRoomListItem from "./ChatRoomListItem";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useShallow } from "zustand/react/shallow";
import { useRouter, useSearchParams } from "next/navigation";

const ChatRoomsListContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRoomId = searchParams.get("roomId");

  const { filteredRooms, loading, error, searchQuery, roomTypeFilter } =
    useChatRoomsStore(
      useShallow((state) => ({
        filteredRooms: state.filteredRooms,
        loading: state.loading,
        error: state.error,
        searchQuery: state.searchQuery,
        roomTypeFilter: state.roomTypeFilter,
      }))
    );

  console.log(filteredRooms);

  const setSearchQuery = useChatRoomsStore((state) => state.setSearchQuery);
  const setRoomTypeFilter = useChatRoomsStore(
    (state) => state.setRoomTypeFilter
  );
  const joinRoom = useChatRoomsStore((state) => state.joinRoom);
  const leaveRoom = useChatRoomsStore((state) => state.leaveRoom);
  const deleteRoomById = useChatRoomsStore((state) => state.deleteRoomById);
  const openCreateRoomModal = useChatRoomsStore(
    (state) => state.openCreateRoomModal
  );

  const handleRoomClick = (roomId: string) => {
    router.push(`/dashboard?roomId=${roomId}`, { scroll: false });
  };

  const roomTypeOptions = [
    { value: "ALL", label: "All Rooms", icon: MessageSquare },
    { value: RoomType.PUBLIC, label: "Public", icon: Globe },
    { value: RoomType.PRIVATE, label: "Private", icon: Lock },
    { value: RoomType.DIRECT_MESSAGE, label: "Direct", icon: Users },
  ];

  return (
    <div className="h-full flex flex-col border-r bg-white">
      {/* Header */}
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Chats</h2>
          <button
            onClick={() => openCreateRoomModal()}
            className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            title="Create new chat room"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex mt-3 space-x-1">
          {roomTypeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setRoomTypeFilter(value as RoomType | "ALL")}
              className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                roomTypeFilter === value
                  ? "bg-blue-100 text-blue-700 border border-blue-200"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={16} className="mr-1" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="h-full">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 mx-4 mt-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredRooms.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare size={48} className="text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No chat rooms found
              </h3>
              <p className="text-gray-500 text-sm mb-4">
                {searchQuery
                  ? "Try adjusting your search terms"
                  : "Create your first chat room to get started"}
              </p>
              <button
                onClick={() => openCreateRoomModal()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create Chat Room
              </button>
            </div>
          )}

          {/* Chat Rooms List */}
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
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-gray-50 flex-shrink-0">
        <div className="text-center">
          <p className="text-xs text-gray-500">
            {filteredRooms.length}{" "}
            {filteredRooms.length === 1 ? "room" : "rooms"}
          </p>
        </div>
      </div>
    </div>
  );
};

const ChatRoomsList = () => {
  return (
    <Suspense
      fallback={
        <div className="border-r bg-white h-full">
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading...</div>
          </div>
        </div>
      }
    >
      <ChatRoomsListContent />
    </Suspense>
  );
};

export default ChatRoomsList;
