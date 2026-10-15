import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
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
  Settings,
  LogOut,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { userApi } from "@/lib/api/userApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { RoomCover } from "@/components/common/RoomCover";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { DELETED_USER, isDeletedUser } from "@/components/common/deletedUser";

interface RoomInfoDialogProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  /** Element that gets focus back when the dialog closes. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

const MAX_LOADED_MEMBERS = 10;

const roomTypeConfig = {
  [RoomType.PUBLIC]: { Icon: Globe, color: "text-success", bgColor: "bg-accent", label: "Public room" },
  [RoomType.PRIVATE]: { Icon: Lock, color: "text-warning", bgColor: "bg-warning-surface", label: "Private room" },
  [RoomType.DIRECT_MESSAGE]: { Icon: Users, color: "text-primary", bgColor: "bg-accent", label: "Direct message" },
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
  const [leaveOpen, setLeaveOpen] = useState(false);
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
        if (response.data.participants && response.data.participants.length > 0) {
          await loadParticipants(response.data.participants.slice(0, MAX_LOADED_MEMBERS));
        }
      }
    } catch {
      setLoadError("Failed to load room information");
    } finally {
      setIsLoading(false);
    }
  };

  const loadParticipants = async (participantIds: string[]) => {
    try {
      const results = await Promise.all(participantIds.map((id) => userApi.getUserById(id).catch(() => null)));
      setParticipants(results.filter((r) => r?.success && r.data).map((r) => r!.data));
    } catch {
      setParticipants([]);
    }
  };

  const handleJoin = async () => {
    if (!room) return;
    setIsActionLoading(true);
    try {
      await chatRoomApi.joinChatRoom(room.id);
      toast.success("You joined the room");
      await loadRoomInfo();
    } catch {
      toast.error("Could not join the room");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!room) return;
    setIsActionLoading(true);
    try {
      const response = await chatRoomApi.leaveChatRoom(room.id);
      if (response.success) {
        toast.success("You left the room");
        onClose();
      }
    } catch {
      toast.error("Could not leave the room");
    } finally {
      setIsActionLoading(false);
    }
  };

  const isUserInRoom = room?.participants?.includes(user?.id || "");
  const isUserCreator = room?.createdBy === user?.id;
  const isDM = room?.roomType === RoomType.DIRECT_MESSAGE;
  const title = room ? room.displayName || room.roomName || "Direct message" : "";

  // Return focus to the opener when it is not the element focused before opening (Radix default).
  const handleCloseAutoFocus = (event: Event) => {
    if (!returnFocusRef?.current) return;
    event.preventDefault();
    returnFocusRef.current.focus();
  };

  const typeConfig = room ? roomTypeConfig[room.roomType] : undefined;

  const content = (
    <div className="space-y-5">
      {isLoading ? (
        <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading room information">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center" role="alert">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">Could not load room information</p>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadRoomInfo()}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : room ? (
        <>
          {/* Identity: the room's own cover, mark and type */}
          <div className={`overflow-hidden ${isMobile ? "-mx-4" : "-mx-6 -mt-2"}`}>
            <RoomCover name={title} className="h-24" />
            <div className={isMobile ? "px-4" : "px-6"}>
              {isDM && room.counterpart ? (
                <UserAvatar
                  name={room.counterpart.name}
                  avatarUrl={room.counterpart.avatarUrl}
                  size="xl"
                  className="-mt-12 ring-4 ring-popover"
                />
              ) : (
                <RoomAvatar name={title} className="-mt-9 h-[72px] w-[72px] rounded-2xl text-2xl ring-4 ring-popover" />
              )}
              <h3 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-[-0.02em]">{title}</h3>
              {typeConfig && (
                <span
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeConfig.bgColor} ${typeConfig.color}`}
                >
                  <typeConfig.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {typeConfig.label}
                </span>
              )}
            </div>
          </div>

          {room.description && <p className="text-sm leading-relaxed text-muted-foreground">{room.description}</p>}

          <dl className="grid grid-cols-2 gap-3">
            {!isDM && (
              <div className="rounded-xl bg-muted/60 px-4 py-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> Members
                </dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular">
                  {room.participants?.length || 0}
                  {room.maxUsers > 0 && <span className="text-muted-foreground"> / {room.maxUsers}</span>}
                </dd>
              </div>
            )}
            <div className={`rounded-xl bg-muted/60 px-4 py-3 ${isDM ? "col-span-2" : ""}`}>
              <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Created
              </dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular">
                {new Date(room.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>

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

          {participants.length > 0 && (
            <section aria-label="Participants" className="space-y-2">
              <h4 className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {isDM ? "People" : "Members"}
                <span className="ml-1.5 font-mono normal-case tracking-normal">
                  {participants.length}
                  {room.participants && room.participants.length > participants.length && ` of ${room.participants.length}`}
                </span>
              </h4>
              <ul className="max-h-52 space-y-0.5 overflow-y-auto">
                {participants.map((participant) => (
                  <li key={participant.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/60">
                    <UserAvatar
                      name={participant.name || DELETED_USER}
                      avatarUrl={participant.avatarUrl}
                      variant={isDeletedUser(participant.name || DELETED_USER) ? "neutral" : "default"}
                    />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {participant.name || DELETED_USER}
                      {participant.id === user?.id && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
                      )}
                    </p>
                    {participant.id === room.createdBy && !isDM && (
                      <span className="flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-medium text-warning">
                        <Shield className="h-3 w-3" aria-hidden="true" /> Owner
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            {!isUserInRoom && (
              <Button onClick={handleJoin} disabled={isActionLoading} className="w-full">
                <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                Join room
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
                <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                Room settings
              </Button>
            )}
            {isUserInRoom && !isDM && (
              <Button
                onClick={() => setLeaveOpen(true)}
                disabled={isActionLoading}
                variant="ghost"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                Leave room
              </Button>
            )}
          </div>
          <ConfirmDialog
            open={leaveOpen}
            onOpenChange={setLeaveOpen}
            title={`Leave ${title}?`}
            description={
              room.roomType === RoomType.PRIVATE
                ? "This room is private. You will need a new invitation to come back."
                : "You can join again later from Discover."
            }
            confirmLabel="Leave room"
            destructive
            onConfirm={handleLeave}
          />
        </>
      ) : (
        <div className="text-center text-muted-foreground">Room not found</div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto" onCloseAutoFocus={handleCloseAutoFocus}>
          <SheetHeader className="sr-only">
            <SheetTitle>Room information</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-h-[88dvh] max-w-md gap-4 overflow-y-auto rounded-2xl"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Room information</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
