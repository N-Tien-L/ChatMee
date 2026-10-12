"use client";

import React from "react";
import { Button } from "../ui/button";
import { Info } from "lucide-react";
import { ChatRoom, RoomType } from "@/lib/types";

interface ChatHeaderProps {
  room: ChatRoom;
  memberCount: number;
  onlineCount: number;
  /** False until the first presence snapshot: no online/offline wording yet (SPEC-005 AC-005-6). */
  presenceKnown: boolean;
  /** DM only: whether the other member is online. */
  counterpartOnline: boolean;
  onOpenInfo: () => void;
}

/** "N members · M online" for groups, "Online" / "Offline" for direct messages. */
export const roomSubtitle = ({
  room,
  memberCount,
  onlineCount,
  presenceKnown,
  counterpartOnline,
}: Omit<ChatHeaderProps, "onOpenInfo">): string => {
  if (room.roomType === RoomType.DIRECT_MESSAGE) {
    if (!presenceKnown) return "";
    return counterpartOnline ? "Online" : "Offline";
  }
  const members = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
  return presenceKnown ? `${members} · ${onlineCount} online` : members;
};

const ChatHeader: React.FC<ChatHeaderProps> = (props) => {
  const { room, onOpenInfo } = props;
  const subtitle = roomSubtitle(props);
  const title = room.displayName || room.roomName;

  return (
    <div className="flex items-center justify-between p-3 sm:p-4 border-b bg-white shadow-sm flex-shrink-0">
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
          {title.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-gray-500 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-1 flex-shrink-0">
        <Button variant="ghost" size="sm" className="p-2" aria-label="Room info" onClick={onOpenInfo}>
          <Info size={18} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};

export default ChatHeader;
