import React, { useEffect, useState } from "react";
import { ChatRoom, UserSummaryResponse } from "@/lib/types";
import { ParticipantRole, RoomType } from "@/lib/types";
import { InvitePeopleDialog } from "./InvitePeopleDialog";
import {
  Globe,
  Lock,
  Users,
  Calendar,
  UserCheck,
  Shield,
  AlertCircle,
  RotateCw,
  UserPlus,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { userApi } from "@/lib/api/userApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { DELETED_USER, isDeletedUser } from "@/components/common/deletedUser";

interface RoomInfoDialogProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  /** Element that gets focus back when the dialog closes. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

// Simple toast helper (can be replaced with proper toast system later)
const showToast = (message: string, type: "success" | "error" = "success") => {
  // For now using alert, can be replaced with proper toast component
  if (type === "error") {
    alert(`Error: ${message}`);
  } else {
    alert(message);
  }
};

const roomTypeConfig = {
  [RoomType.PUBLIC]: {
    Icon: Globe,
    color: "text-success",
    bgColor: "bg-accent",
    label: "Public Room",
  },
  [RoomType.PRIVATE]: {
    Icon: Lock,
    color: "text-warning",
    bgColor: "bg-warning-surface",
    label: "Private Room",
  },
  [RoomType.DIRECT_MESSAGE]: {
    Icon: Users,
    color: "text-primary",
    bgColor: "bg-accent",
    label: "Direct Message",
  },
};

export const RoomInfoDialog: React.FC<RoomInfoDialogProps> = ({
  roomId,
  isOpen,
  onClose,
  onOpenSettings,
  returnFocusRef,
}) => {
  const isMobile = useIsMobile();
  const { user } = useAuthStore();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [participants, setParticipants] = useState<UserSummaryResponse[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && roomId) {
      loadRoomInfo();
    }
  }, [isOpen, roomId]);

  const loadRoomInfo = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await chatRoomApi.getChatRoomById(roomId);
      if (!response.success) {
        setLoadError(response.message || "Failed to load room information");
      } else if (response.data) {
        setRoom(response.data);
        // Load participant details
        if (
          response.data.participants &&
          response.data.participants.length > 0
        ) {
          await loadParticipants(response.data.participants.slice(0, 10)); // Load first 10
        }
      }
    } catch (error) {
      console.error("Error loading room info:", error);
      setLoadError("Failed to load room information");
    } finally {
      setIsLoading(false);
    }
  };

  const loadParticipants = async (participantIds: string[]) => {
    try {
      const participantPromises = participantIds.map((id) =>
        userApi.getUserById(id).catch(() => null)
      );
      const results = await Promise.all(participantPromises);
      const validParticipants = results
        .filter((r) => r?.success && r.data)
        .map((r) => r!.data);
      setParticipants(validParticipants);
    } catch (error) {
      console.error("Error loading participants:", error);
    }
  };

  const handleJoin = async () => {
    if (!room) return;
    setIsActionLoading(true);
    try {
      await chatRoomApi.joinChatRoom(room.id);
      showToast("You've joined the room");
      await loadRoomInfo(); // Reload to update participant list
    } catch (error) {
      console.error("Error joining room:", error);
      showToast("Failed to join the room", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!room) return;
    if (
      !window.confirm(
        `Are you sure you want to leave "${
          room.displayName || room.roomName || "this room"
        }"?`
      )
    ) {
      return;
    }
    setIsActionLoading(true);
    try {
      const response = await chatRoomApi.leaveChatRoom(room.id);
      if (response.success) {
        showToast("You've left the room");
        onClose();
      }
    } catch (error) {
      console.error("Error leaving room:", error);
      showToast("Failed to leave the room", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const isUserInRoom = room?.participants?.includes(user?.id || "");
  const isUserCreator = room?.createdBy === user?.id;
  const isDM = room?.roomType === RoomType.DIRECT_MESSAGE;

  // Return focus to the opener when it is not the element focused before opening (Radix default).
  const handleCloseAutoFocus = (event: Event) => {
    if (!returnFocusRef?.current) return;
    event.preventDefault();
    returnFocusRef.current.focus();
  };

  const content = (
    <div className="space-y-6">
      {isLoading ? (
        <div
          className="space-y-4"
          role="status"
          aria-busy="true"
          aria-label="Loading room information"
        >
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : loadError ? (
        <div
          className="flex flex-col items-center text-center gap-3 py-6"
          role="alert"
        >
          <AlertCircle className="w-8 h-8 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">Could not load room information</p>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadRoomInfo()}>
            <RotateCw className="w-4 h-4 mr-2" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : room ? (
        <>
          {/* Header Section */}
          <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b">
            <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-3xl">
              {(room.displayName || room.roomName || "DM")
                .charAt(0)
                .toUpperCase()}
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-semibold">
                {room.displayName || room.roomName || "Direct Message"}
              </h3>
              {roomTypeConfig[room.roomType] && (
                <div className="flex items-center justify-center gap-2">
                  {React.createElement(roomTypeConfig[room.roomType].Icon, {
                    className: `w-4 h-4 ${roomTypeConfig[room.roomType].color}`,
                  })}
                  <span
                    className={`text-sm ${roomTypeConfig[room.roomType].color}`}
                  >
                    {roomTypeConfig[room.roomType].label}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {room.description && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">
                Description
              </h4>
              <p className="text-sm text-muted-foreground">{room.description}</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span className="text-xs">Members</span>
              </div>
              <p className="text-lg font-semibold">
                {room.participants?.length || 0}
                {room.maxUsers && ` / ${room.maxUsers}`}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span className="text-xs">Created</span>
              </div>
              <p className="text-lg font-semibold">
                {new Date(room.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {room.roomType === RoomType.PRIVATE &&
            (room.myRole === ParticipantRole.OWNER || room.myRole === ParticipantRole.ADMIN) && (
              <>
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:brightness-110 active:scale-[0.98]"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Invite people
                </button>
                <InvitePeopleDialog
                  roomId={room.id}
                  roomName={room.roomName}
                  memberIds={room.participants ?? []}
                  isOpen={inviteOpen}
                  onClose={() => setInviteOpen(false)}
                />
              </>
            )}

          {/* Participants List */}
          {participants.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                Participants ({participants.length}
                {room.participants && room.participants.length > 10 && (
                  <span className="text-muted-foreground">
                    {" "}
                    / {room.participants.length}
                  </span>
                )}
                )
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/60"
                  >
                    <UserAvatar
                      name={participant.name || DELETED_USER}
                      avatarUrl={participant.avatarUrl}
                      variant={isDeletedUser(participant.name || DELETED_USER) ? "neutral" : "default"}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {participant.name || DELETED_USER}
                        {participant.id === user?.id && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (You)
                          </span>
                        )}
                      </p>
                    </div>
                    {participant.id === room.createdBy && (
                      <Shield className="w-4 h-4 text-warning" />
                    )}
                  </div>
                ))}
              </div>
              {room.participants && room.participants.length > 10 && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing first 10 participants
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-4 border-t">
            {!isUserInRoom && (
              <Button
                onClick={handleJoin}
                disabled={isActionLoading}
                className="w-full"
              >
                <UserCheck className="w-4 h-4 mr-2" />
                Join Room
              </Button>
            )}
            {isUserInRoom && !isDM && (
              <Button
                onClick={handleLeave}
                disabled={isActionLoading}
                variant="destructive"
                className="w-full"
              >
                Leave Room
              </Button>
            )}
            {isUserCreator && onOpenSettings && (
              <Button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                variant="outline"
                className="w-full"
              >
                <Shield className="w-4 h-4 mr-2" />
                Room Settings
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="text-center text-muted-foreground">Room not found</div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <SheetHeader>
            <SheetTitle>Room Information</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md max-h-[80vh] overflow-y-auto"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Room Information</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
