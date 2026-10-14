"use client";

import React from "react";
import { Button } from "../ui/button";
import { Hash, Info, Lock } from "lucide-react";
import { ChatRoom, RoomType } from "@/lib/types";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { UserAvatar } from "@/components/common/UserAvatar";

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

const shell =
  "relative flex flex-shrink-0 items-center gap-3 border-b border-border bg-card/80 px-3 py-3 backdrop-blur sm:gap-4 sm:px-7 sm:py-3.5";

function InfoButton({ onOpenInfo }: { onOpenInfo: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="flex-shrink-0 rounded-xl p-2" aria-label="Room info" onClick={onOpenInfo}>
      <Info size={18} aria-hidden="true" />
    </Button>
  );
}

/** A direct message reads as a person: avatar with presence, name and status. No room fields. */
function DirectHeader({ room, presenceKnown, counterpartOnline, onOpenInfo }: ChatHeaderProps) {
  const name = room.counterpart?.name || room.displayName || room.roomName;
  const pending = room.state === "REQUESTED";
  const status = !presenceKnown ? "Direct message" : counterpartOnline ? "Online now" : "Offline";
  return (
    <div className={shell}>
      <div className="relative flex-shrink-0">
        <UserAvatar name={name} avatarUrl={room.counterpart?.avatarUrl} size="lg" className="h-11 w-11" />
        {presenceKnown && (
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${
              counterpartOnline ? "bg-success text-success animate-live" : "bg-muted-foreground/40"
            }`}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
          {name}
        </h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{status}</span>
          {pending && (
            <span className="rounded-full bg-warning-surface px-2 py-0.5 font-medium text-warning">
              Waiting for them to accept
            </span>
          )}
        </p>
      </div>
      <InfoButton onOpenInfo={onOpenInfo} />
    </div>
  );
}

/** A group room reads as a place: room mark, name and labelled fields (type, members, online). */
function RoomHeader(props: ChatHeaderProps) {
  const { room, onOpenInfo } = props;
  const fields = roomFields(props);
  const title = room.displayName || room.roomName;
  const isPrivate = room.roomType === RoomType.PRIVATE;

  return (
    <div className={shell}>
      <RoomAvatar name={title} className="hidden h-11 w-11 flex-shrink-0 rounded-xl sm:flex" />
      <div className="min-w-0 flex-1">
        <h2 className="flex min-w-0 items-center gap-1.5 font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
          {isPrivate ? (
            <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Hash className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate">{title}</span>
        </h2>
        <dl className="mt-1 flex flex-wrap gap-1.5">
          {fields.map((field) => (
            <div key={field.label} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="font-mono font-medium tabular text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <InfoButton onOpenInfo={onOpenInfo} />
    </div>
  );
}

const ChatHeader: React.FC<ChatHeaderProps> = (props) =>
  props.room.roomType === RoomType.DIRECT_MESSAGE ? <DirectHeader {...props} /> : <RoomHeader {...props} />;

export default ChatHeader;
