import React, { useEffect, useState } from "react";
import { ChatRoomResponse, UserResponse } from "@/lib/type/ResponseType";
import { RoomType } from "@/lib/type/CoreModelsAndEnum";
import { Globe, Lock, Users, Calendar, UserCheck, Shield } from "lucide-react";
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

interface RoomInfoDialogProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
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
    color: "text-green-500",
    bgColor: "bg-green-50",
    label: "Public Room",
  },
  [RoomType.PRIVATE]: {
    Icon: Lock,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    label: "Private Room",
  },
  [RoomType.DIRECT_MESSAGE]: {
    Icon: Users,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    label: "Direct Message",
  },
};

export const RoomInfoDialog: React.FC<RoomInfoDialogProps> = ({
  roomId,
  isOpen,
  onClose,
  onOpenSettings,
}) => {
  const isMobile = useIsMobile();
  const { user } = useAuthStore();
  const [room, setRoom] = useState<ChatRoomResponse | null>(null);
  const [participants, setParticipants] = useState<UserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    if (isOpen && roomId) {
      loadRoomInfo();
    }
  }, [isOpen, roomId]);

  const loadRoomInfo = async () => {
    setIsLoading(true);
    try {
      const response = await chatRoomApi.getChatRoomById(roomId);
      if (response.success && response.data) {
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
      showToast("Failed to load room information", "error");
      onClose();
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
      const response = await chatRoomApi.joinChatRoom(room.id);
      if (response.success) {
        showToast("You've joined the room");
        await loadRoomInfo(); // Reload to update participant list
      }
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

  const content = (
    <div className="space-y-6">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : room ? (
        <>
          {/* Header Section */}
          <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-3xl">
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
              <h4 className="text-sm font-semibold text-gray-700">
                Description
              </h4>
              <p className="text-sm text-gray-600">{room.description}</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500">
                <Users className="w-4 h-4" />
                <span className="text-xs">Members</span>
              </div>
              <p className="text-lg font-semibold">
                {room.participants?.length || 0}
                {room.maxUsers && ` / ${room.maxUsers}`}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500">
                <Calendar className="w-4 h-4" />
                <span className="text-xs">Created</span>
              </div>
              <p className="text-lg font-semibold">
                {new Date(room.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Participants List */}
          {participants.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">
                Participants ({participants.length}
                {room.participants && room.participants.length > 10 && (
                  <span className="text-gray-500">
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
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                      {(participant.name || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {participant.name || "Unknown User"}
                        {participant.id === user?.id && (
                          <span className="text-xs text-gray-500 ml-1">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {participant.email || "No email"}
                      </p>
                    </div>
                    {participant.id === room.createdBy && (
                      <Shield className="w-4 h-4 text-yellow-500" />
                    )}
                  </div>
                ))}
              </div>
              {room.participants && room.participants.length > 10 && (
                <p className="text-xs text-gray-500 text-center">
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
        <div className="text-center text-gray-500">Room not found</div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
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
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Room Information</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
