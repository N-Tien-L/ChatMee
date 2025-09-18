import React, { useState } from "react";
import { ChatRoomResponse } from "@/lib/type/ResponseType";
import { RoomType } from "@/lib/type/ChatTypes";
import {
  MoreVertical,
  Users,
  Lock,
  Globe,
  Trash2,
  UserPlus,
  Settings,
} from "lucide-react";

interface ChatRoomListItemProps {
  room: ChatRoomResponse;
  onJoin: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClick?: () => void;
}

const ChatRoomListItem: React.FC<ChatRoomListItemProps> = ({
  room,
  onJoin,
  onDelete,
  onClick,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const getRoomIcon = () => {
    switch (room.roomType) {
      case RoomType.PUBLIC:
        return <Globe size={16} className="text-green-500" />;
      case RoomType.PRIVATE:
        return <Lock size={16} className="text-orange-500" />;
      case RoomType.DIRECT_MESSAGE:
        return <Users size={16} className="text-blue-500" />;
      default:
        return <Users size={16} className="text-gray-500" />;
    }
  };

  const getRoomTypeColor = () => {
    switch (room.roomType) {
      case RoomType.PUBLIC:
        return "bg-green-100 text-green-700";
      case RoomType.PRIVATE:
        return "bg-orange-100 text-orange-700";
      case RoomType.DIRECT_MESSAGE:
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const handleJoin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      await onJoin();
    } finally {
      setIsLoading(false);
      setShowActions(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${room.roomName}"?`)) {
      setIsLoading(true);
      try {
        await onDelete();
      } finally {
        setIsLoading(false);
        setShowActions(false);
      }
    }
  };

  return (
    <div
      className="relative group hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center p-4">
        {/* Room Avatar/Icon */}
        <div className="flex-shrink-0 mr-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-lg">
            {room.roomName
              ? room.roomName.charAt(0).toUpperCase()
              : "direct message"}
          </div>
        </div>

        {/* Room Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {room.roomName}
            </h3>
            <div className="flex items-center space-x-1">
              {getRoomIcon()}
              <span
                className={`text-xs px-2 py-1 rounded-full ${getRoomTypeColor()}`}
              >
                {room.roomType.toLowerCase()}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 truncate">
              {room.description || "No description"}
            </p>
            <div className="flex items-center text-xs text-gray-400">
              <Users size={12} className="mr-1" />
              {room.maxUsers || "Unlimited"}
            </div>
          </div>

          {/* Last Activity */}
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">
              {room.createdAt
                ? new Date(room.createdAt).toLocaleDateString()
                : "Recently"}
            </span>
          </div>
        </div>

        {/* Actions Menu */}
        <div className="flex-shrink-0 ml-2">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(!showActions);
              }}
              className="p-1 rounded-lg hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
              disabled={isLoading}
            >
              <MoreVertical size={16} className="text-gray-500" />
            </button>

            {/* Dropdown Actions */}
            {showActions && (
              <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="py-1">
                  <button
                    onClick={handleJoin}
                    disabled={isLoading}
                    className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <UserPlus size={16} className="mr-2" />
                    Join Room
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActions(false);
                      // Add room settings logic here
                    }}
                    className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Settings size={16} className="mr-2" />
                    Room Settings
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isLoading}
                    className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={16} className="mr-2" />
                    Delete Room
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
};

export default ChatRoomListItem;
