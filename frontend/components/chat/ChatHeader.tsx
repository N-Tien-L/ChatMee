"use client";

import React from "react";
import { Button } from "../ui/button";
import { Info, Lock } from "lucide-react";
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

interface HeaderField {
  label: string;
  value: string;
}

/** Labelled fields under the room name: capacity and presence for groups, status for direct messages. */
export const roomFields = ({
  room,
  memberCount,
  onlineCount,
  presenceKnown,
  counterpartOnline,
}: Omit<ChatHeaderProps, "onOpenInfo">): HeaderField[] => {
  if (room.roomType === RoomType.DIRECT_MESSAGE) {
    if (!presenceKnown) return [{ label: "Direct", value: "1:1" }];
    return [{ label: "Status", value: counterpartOnline ? "Online" : "Offline" }];
  }
  // maxUsers <= 0 means unlimited.
  const capacity = room.maxUsers > 0 ? `${memberCount}/${room.maxUsers}` : `${memberCount}`;
  const fields: HeaderField[] = [
    { label: "Room", value: room.roomType === RoomType.PRIVATE ? "Private" : "Public" },
    { label: "Members", value: capacity },
  ];
  if (presenceKnown) fields.push({ label: "Online", value: `${onlineCount}` });
  return fields;
};

const ChatHeader: React.FC<ChatHeaderProps> = (props) => {
  const { room, onOpenInfo } = props;
  const fields = roomFields(props);
  const title = room.displayName || room.roomName;

  return (
    <div className="flex flex-shrink-0 items-end gap-3 border-b bg-card px-3 py-3 sm:gap-5 sm:px-7 sm:py-4">
      <div className="min-w-0 flex-1 sm:flex sm:items-end sm:gap-6">
        <h2 className="flex min-w-0 items-center gap-2 text-xl font-bold leading-none tracking-[-0.02em] text-foreground sm:text-[26px]">
          {room.roomType === RoomType.PRIVATE && (
            <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate">{title}</span>
        </h2>
        <dl className="mt-2 flex gap-4 sm:mt-0 sm:gap-6">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[10px] uppercase leading-none tracking-[0.1em] text-muted-foreground">
                {field.label}
              </dt>
              <dd className="mt-1 font-mono text-[13px] font-medium leading-none tabular text-foreground">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <Button variant="ghost" size="sm" className="flex-shrink-0 p-2" aria-label="Room info" onClick={onOpenInfo}>
        <Info size={18} aria-hidden="true" />
      </Button>
    </div>
  );
};

export default ChatHeader;
