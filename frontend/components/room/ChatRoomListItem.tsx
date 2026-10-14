import React, { useEffect, useRef, useState } from "react";
import { ChatRoom, ParticipantRole, RoomType } from "@/lib/types";
import { MoreVertical, Lock, Trash2, UserMinus, Info } from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RelativeTime } from "@/components/common/RelativeTime";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { UnreadBadge } from "@/components/common/UnreadBadge";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RoomInfoDialog } from "./RoomInfoDialog";
import { RoomSettingsDialog } from "./RoomSettingsDialog";

interface ChatRoomListItemProps {
  room: ChatRoom;
  onLeave?: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClick?: () => void;
  isSelected?: boolean;
}

const previewText = (room: ChatRoom, currentUserId: string | undefined): string => {
  const last = room.lastMessage;
  if (!last) return room.description || "No messages yet";
  if (last.senderId === currentUserId) return `You: ${last.preview}`;
  // In a direct message the sender is obvious; the preview is just their words.
  if (room.roomType === RoomType.DIRECT_MESSAGE) return last.preview;
  return `${last.senderName || "Someone"}: ${last.preview}`;
};

const ChatRoomListItem: React.FC<ChatRoomListItemProps> = ({
  room,
  onLeave,
  onDelete,
  onClick,
  isSelected = false,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [confirming, setConfirming] = useState<"leave" | "delete" | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Dialogs opened from the menu return focus here (the menu item is gone by then).
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const roomName = room.displayName || room.roomName || "Direct Message";
  const user = useAuthStore((state) => state.user);
  const updateRoom = useChatRoomsStore((state) => state.updateRoom);

  const isDirect = room.roomType === RoomType.DIRECT_MESSAGE;
  const isPending = room.state === "REQUESTED";
  const unread = room.unreadCount ?? 0;
  // myRole comes with the room; creator is the fallback for payloads that predate it.
  const isOwner = room.myRole
    ? room.myRole === ParticipantRole.OWNER
    : room.createdBy === user?.id;
  const activityAt = room.lastActivityAt || room.createdAt;

  useEffect(() => {
    const handleClickOutSide = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowActions(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowActions(false);
        actionsButtonRef.current?.focus();
      }
    };

    if (showActions) {
      document.addEventListener("mousedown", handleClickOutSide);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutSide);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showActions]);

  const runConfirmed = async (action: (() => Promise<boolean>) | undefined) => {
    if (!action) return;
    setIsLoading(true);
    try {
      await action();
    } finally {
      setIsLoading(false);
      setShowActions(false);
    }
  };

  return (
    <div
      className={`relative group cursor-pointer rounded-xl transition-all duration-200 ${
        isSelected
          ? "bg-sidebar-accent shadow-[inset_3px_0_0_var(--primary)] ring-1 ring-primary/15"
          : "hover:bg-accent/60 active:bg-accent"
      }`}
      onClick={onClick}
    >
      <div className="flex min-h-14 items-center gap-3 px-2.5 py-2.5">
        <div className="flex-shrink-0">
          {isDirect ? (
            <UserAvatar
              name={roomName}
              avatarUrl={room.counterpart?.avatarUrl}
              size="lg"
            />
          ) : (
            <RoomAvatar name={roomName} className="h-10 w-10 rounded-xl" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5 gap-2">
            <h3
              className={`text-sm text-foreground truncate min-w-0 flex items-center gap-1 ${
                unread > 0 ? "font-semibold" : "font-medium"
              }`}
            >
              {room.roomType === RoomType.PRIVATE && (
                <Lock
                  className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground"
                  role="img"
                  aria-label="Private room"
                />
              )}
              {/* Keyboard entry point; the click bubbles to the row's onClick. */}
              <button
                type="button"
                className="max-w-full truncate text-left rounded"
                aria-current={isSelected ? "true" : undefined}
              >
                {roomName}
              </button>
            </h3>
            {activityAt && (
              <RelativeTime
                value={activityAt}
                className="font-mono text-[11px] tabular text-muted-foreground flex-shrink-0"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p
              className={`text-xs truncate ${
                unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              {previewText(room, user?.id)}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isPending && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning-surface text-warning">
                  Pending
                </span>
              )}
              <UnreadBadge count={unread} />
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 ml-1">
          <div className="relative" ref={dropdownRef}>
            <button
              ref={actionsButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(!showActions);
              }}
              // Always visible on touch screens; on desktop shown on hover or keyboard focus.
              className="p-1 sm:p-1.5 rounded-lg hover:bg-accent opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100 transition-opacity touch-manipulation"
              disabled={isLoading}
              aria-label={`Actions for ${roomName}`}
              aria-haspopup="true"
              aria-expanded={showActions}
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>

            {showActions && (
              <div className="absolute right-0 top-8 w-48 bg-card border border-border rounded-lg shadow-lg z-10">
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActions(false);
                      setShowInfoDialog(true);
                    }}
                    className="w-full flex items-center px-4 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <Info size={16} className="mr-2" aria-hidden="true" />
                    Info
                  </button>

                  {!isOwner && onLeave && !isDirect && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirming("leave");
                      }}
                      disabled={isLoading}
                      className="w-full flex items-center px-4 py-2 text-sm text-warning hover:bg-warning-surface disabled:opacity-50"
                    >
                      <UserMinus size={16} className="mr-2" aria-hidden="true" />
                      Leave
                    </button>
                  )}

                  {isOwner && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirming("delete");
                      }}
                      disabled={isLoading}
                      className="w-full flex items-center px-4 py-2 text-sm text-destructive hover:bg-danger-surface disabled:opacity-50"
                    >
                      <Trash2 size={16} className="mr-2" aria-hidden="true" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-card/50 flex items-center justify-center">
          <div className="motion-safe:animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
      )}

      <ConfirmDialog
        open={confirming === "leave"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Leave this room?"
        description={`You will stop receiving messages from "${roomName}".`}
        confirmLabel="Leave"
        destructive
        onConfirm={() => void runConfirmed(onLeave)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete this room?"
        description={`"${roomName}" and its messages will be removed for everyone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void runConfirmed(onDelete)}
      />

      <RoomInfoDialog
        roomId={room.id}
        isOpen={showInfoDialog}
        onClose={() => setShowInfoDialog(false)}
        onOpenSettings={() => setShowSettingsDialog(true)}
        returnFocusRef={actionsButtonRef}
      />

      {isOwner && (
        <RoomSettingsDialog
          roomId={room.id}
          isOpen={showSettingsDialog}
          onClose={() => setShowSettingsDialog(false)}
          returnFocusRef={actionsButtonRef}
          onSaved={(updatedRoom) => {
            updateRoom(room.id, updatedRoom);
          }}
        />
      )}
    </div>
  );
};

export default ChatRoomListItem;
