"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { MemberResponse, ParticipantRole, RoomType } from "@/lib/types";
import { findSuccessor } from "./roomPermissions";

interface LeaveRoomConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  roomType: RoomType;
  myRole: ParticipantRole | null | undefined;
  myUserId: string | undefined;
  /** Members already loaded by the caller; otherwise an owner's confirm loads them to name the next owner. */
  members?: MemberResponse[];
  onConfirm: () => void;
}

const leaveCopy = (roomType: RoomType) =>
  roomType === RoomType.PRIVATE
    ? "This room is private. You will need a new invitation to come back."
    : "You can join again later from Discover.";

/** Leave confirmation. When the owner leaves it names the next owner (SPEC-008 section 5, SPEC-009 AC-009-24). */
export function LeaveRoomConfirm({
  open,
  onOpenChange,
  roomId,
  roomName,
  roomType,
  myRole,
  myUserId,
  members,
  onConfirm,
}: LeaveRoomConfirmProps) {
  const isOwner = myRole === ParticipantRole.OWNER;
  const [loaded, setLoaded] = useState<MemberResponse[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !isOwner || members) return;
    let active = true;
    chatRoomApi
      .getMembers(roomId)
      .then((response) => {
        if (!active) return;
        if (response.success && Array.isArray(response.data)) setLoaded(response.data);
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open, isOwner, members, roomId]);

  // A closed confirm forgets the loaded list, so the next open names the owner from fresh data.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setLoaded(null);
      setFailed(false);
    }
    onOpenChange(next);
  };

  const list = members ?? loaded;
  let description = leaveCopy(roomType);
  if (isOwner && myUserId) {
    if (list) {
      const successor = findSuccessor(list, myUserId);
      description = successor
        ? `${successor.name} will become the owner. ${leaveCopy(roomType)}`
        : "You are the only member, so leaving deletes the room.";
    } else {
      description = failed
        ? "Ownership moves to the earliest admin, or else the earliest member."
        : "Checking who becomes the owner...";
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Leave ${roomName}?`}
      description={description}
      confirmLabel="Leave room"
      destructive
      onConfirm={onConfirm}
    />
  );
}
