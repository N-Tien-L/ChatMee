"use client";

import React from "react";
import { Button } from "../ui/button";
import { Info, MoreVertical, Phone, Video } from "lucide-react";
import { ChatRoom } from "@/lib/types";

interface ChatHeaderProps {
  room: ChatRoom;
  loading: boolean;
  onlineCount: number;
  onToggleSidebar?: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  room,
  loading,
  onlineCount,
  onToggleSidebar,
}) => {
  return (
    <div className="flex items-center justify-between p-3 sm:p-4 border-b bg-white shadow-sm flex-shrink-0">
      {/* Mobile toggle button */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="md:hidden text-gray-700 p-2 hover:bg-gray-100 rounded-md mr-2 flex-shrink-0"
          aria-label="Open sidebar"
        >
          ☰
        </button>
      )}

      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
            {(room.displayName || room.roomName).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                {room.displayName || room.roomName}
              </h1>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm">
              <p className="text-gray-500 truncate">
                {room.description}
                {loading && " • Loading..."}
              </p>
              <p className="text-gray-500 whitespace-nowrap">
                • {onlineCount} online
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-1 flex-shrink-0">
        <Button variant="ghost" size="sm" className="p-2 hidden sm:flex">
          <Phone size={18} />
        </Button>
        <Button variant="ghost" size="sm" className="p-2 hidden md:flex">
          <Video size={18} />
        </Button>
        <Button variant="ghost" size="sm" className="p-2 hidden lg:flex">
          <Info size={18} />
        </Button>
        <Button variant="ghost" size="sm" className="p-2">
          <MoreVertical size={18} />
        </Button>
      </div>
    </div>
  );
};

export default ChatHeader;
