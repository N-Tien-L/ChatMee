"use client";

import React from "react";
import { Button } from "../ui/button";
import { Info, MoreVertical, Phone, Video } from "lucide-react";
import { ChatRoom } from "@/lib/types";

interface ChatHeaderProps {
  room: ChatRoom;
  loading: boolean;
  onlineCount: number;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  room,
  loading,
  onlineCount,
}) => {
  return (
    <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold">
            {(room.displayName || room.roomName).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-semibold text-gray-900">
                {room.displayName || room.roomName}
              </h1>
            </div>
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-500">
                {room.description}
                {loading && " • Loading messages..."}
              </p>
              <p className="text-sm text-gray-500">• {onlineCount} online</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="sm" className="p-2">
          <Phone size={18} />
        </Button>
        <Button variant="ghost" size="sm" className="p-2">
          <Video size={18} />
        </Button>
        <Button variant="ghost" size="sm" className="p-2">
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
