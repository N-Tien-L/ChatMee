"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Globe,
  Lock,
  LogOut,
  MessageCircle,
  RotateCw,
  Save,
  Settings,
  Shield,
  ShieldCheck,
  ShieldMinus,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { ChatRoom, MemberResponse, ParticipantRole, RoomType, UpdateChatRoomRequest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { RoomCover } from "@/components/common/RoomCover";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { DELETED_USER, isDeletedUser } from "@/components/common/deletedUser";
import { InvitePeopleDialog } from "./InvitePeopleDialog";
import { LeaveRoomConfirm } from "./LeaveRoomConfirm";
import { canChangeRole, canDeleteRoom, canEditRoom, canInvite, canRemoveMember } from "./roomPermissions";

interface RoomPanelProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Element that gets focus back when the panel closes. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

type View = "info" | "settings";
type Pending = { kind: "remove"; member: MemberResponse } | { kind: "delete" } | { kind: "leave" } | null;

const roomTypeConfig = {
  [RoomType.PUBLIC]: { Icon: Globe, color: "text-success", bgColor: "bg-accent", label: "Public room" },
  [RoomType.PRIVATE]: { Icon: Lock, color: "text-warning", bgColor: "bg-warning-surface", label: "Private room" },
  [RoomType.DIRECT_MESSAGE]: { Icon: Users, color: "text-primary", bgColor: "bg-accent", label: "Direct message" },
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const joinErrorText = (error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined;
  if (isAxiosError<{ code?: string }>(cause) && cause.response?.data?.code === "ROOM_FULL") return "This room is full.";
  return "Could not join the room";
};

const memberName = (member: MemberResponse) => member.name || DELETED_USER;

/**
 * One room panel (CM-066): info, members with roles and the actions the caller's participant role allows
 * (SPEC-008 AC-008-9, SPEC-009 AC-009-23..25), plus the settings view for OWNER/ADMIN. Never decides by `createdBy`.
 */
export const RoomPanel: React.FC<RoomPanelProps> = ({ roomId, isOpen, onClose, returnFocusRef }) => {
  const isMobile = useIsMobile();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const liveRole = useChatRoomsStore((state) => state.rooms.find((r) => r.id === roomId)?.myRole);
  const updateRoom = useChatRoomsStore((state) => state.updateRoom);
  const leaveRoom = useChatRoomsStore((state) => state.leaveRoom);
  const deleteRoomById = useChatRoomsStore((state) => state.deleteRoomById);
  const startDirectMessage = useChatRoomsStore((state) => state.startDirectMessage);

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [members, setMembers] = useState<MemberResponse[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("info");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [form, setForm] = useState({ roomName: "", description: "", maxUsers: 0 });
  const [isDirty, setIsDirty] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const response = await chatRoomApi.getMembers(roomId);
      setMembers(response.success && Array.isArray(response.data) ? response.data : null);
    } catch {
      setMembers(null);
    }
  }, [roomId]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await chatRoomApi.getChatRoomById(roomId);
      if (!response.success || !response.data) {
        setLoadError(response.message || "Failed to load room information");
        return;
      }
      setRoom(response.data);
      setForm({
        roomName: response.data.roomName ?? "",
        description: response.data.description ?? "",
        maxUsers: response.data.maxUsers || 0,
      });
      setIsDirty(false);
      await loadMembers();
    } catch {
      setLoadError("Failed to load room information");
    } finally {
      setIsLoading(false);
    }
  }, [roomId, loadMembers]);

  useEffect(() => {
    if (isOpen && roomId) {
      setView("info");
      void load();
    }
  }, [isOpen, roomId, load]);

  const me = members?.find((member) => member.id === user?.id);
  // The live role (refreshed by ROOM_UPDATED) wins over the fetched one; the member row is the last fallback.
  const myRole = liveRole ?? room?.myRole ?? me?.role ?? null;
  const isDM = room?.roomType === RoomType.DIRECT_MESSAGE;
  const isMember = Boolean(user && (room?.participants?.includes(user.id) || me));
  const title = room ? room.displayName || room.roomName || "Direct message" : "";
  const mayEdit = !isDM && canEditRoom(myRole);
  const mayDelete = !isDM && canDeleteRoom(myRole);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = () =>
    run(async () => {
      if (!room) return;
      try {
        await chatRoomApi.joinChatRoom(room.id);
        toast.success("You joined the room");
        await load();
      } catch (error) {
        toast.error(joinErrorText(error));
      }
    });

  const handleLeave = () =>
    run(async () => {
      if (await leaveRoom(roomId)) onClose();
    });

  const handleDelete = () =>
    run(async () => {
      if (await deleteRoomById(roomId)) onClose();
    });

  const handleRemove = (member: MemberResponse) =>
    run(async () => {
      try {
        await chatRoomApi.removeMember(roomId, member.id);
        toast.success(`${memberName(member)} was removed`);
        await load();
      } catch (error) {
        toast.error(errorText(error, `Could not remove ${memberName(member)}`));
      }
    });

  const handleRole = (member: MemberResponse) =>
    run(async () => {
      const promote = member.role === ParticipantRole.MEMBER;
      try {
        await chatRoomApi.changeMemberRole(roomId, member.id, promote ? ParticipantRole.ADMIN : ParticipantRole.MEMBER);
        toast.success(`${memberName(member)} is now ${promote ? "an admin" : "a member"}`);
        await loadMembers();
      } catch (error) {
        toast.error(errorText(error, "Could not change the role"));
      }
    });

  const handleMessage = (member: MemberResponse) =>
    run(async () => {
      const dm = await startDirectMessage(member.id);
      if (!dm) return;
      onClose();
      router.push(`/dashboard?roomId=${dm.id}`, { scroll: false });
    });

  const handleSave = () =>
    run(async () => {
      if (!room || !isDirty) return;
      const request: UpdateChatRoomRequest = {
        roomName: form.roomName.trim(),
        description: form.description,
        maxUsers: form.maxUsers > 0 ? form.maxUsers : undefined,
      };
      try {
        const response = await chatRoomApi.updateChatRoom(room.id, request);
        if (response.success && response.data) {
          toast.success("Room updated");
          updateRoom(room.id, response.data);
          await load();
          setView("info");
        } else {
          toast.error(response.message || "Could not update the room");
        }
      } catch (error) {
        toast.error(errorText(error, "Could not update the room"));
      }
    });

  const change = (field: keyof typeof form, value: string | number) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setIsDirty(true);
  };

  // Return focus to the opener when it is not the element focused before opening (Radix default).
  const handleCloseAutoFocus = (event: Event) => {
    if (!returnFocusRef?.current) return;
    event.preventDefault();
    returnFocusRef.current.focus();
  };

  const typeConfig = room ? roomTypeConfig[room.roomType] : undefined;

  const memberRow = (member: MemberResponse) => {
    const name = memberName(member);
    const deleted = isDeletedUser(name);
    const isSelf = member.id === user?.id;
    const promote = member.role === ParticipantRole.MEMBER;
    return (
      <li key={member.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/60">
        <UserAvatar name={name} avatarUrl={member.avatarUrl} variant={deleted ? "neutral" : "default"} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {name}
          {isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
        </p>
        {!isDM && member.role === ParticipantRole.OWNER && (
          <span className="flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-medium text-warning">
            <Shield className="h-3 w-3" aria-hidden="true" /> Owner
          </span>
        )}
        {!isDM && member.role === ParticipantRole.ADMIN && (
          <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Admin
          </span>
        )}
        {!isDM && !isSelf && (
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {!deleted && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={busy}
                onClick={() => void handleMessage(member)}
                aria-label={`Message ${name}`}
                title="Message"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {canChangeRole(myRole, member.role, isSelf) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={busy}
                onClick={() => void handleRole(member)}
                aria-label={promote ? `Make ${name} an admin` : `Make ${name} a member`}
                title={promote ? "Make admin" : "Make member"}
              >
                {promote ? (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ShieldMinus className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            )}
            {canRemoveMember(myRole, member.role, isSelf) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => setPending({ kind: "remove", member })}
                aria-label={`Remove ${name}`}
                title="Remove"
              >
                <UserMinus className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </li>
    );
  };

  const infoView = room && (
    <>
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
              {members?.length ?? room.participants?.length ?? 0}
              {room.maxUsers > 0 && <span className="text-muted-foreground"> / {room.maxUsers}</span>}
            </dd>
          </div>
        )}
        <div className={`rounded-xl bg-muted/60 px-4 py-3 ${isDM ? "col-span-2" : ""}`}>
          <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Created
          </dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular">{new Date(room.createdAt).toLocaleDateString()}</dd>
        </div>
      </dl>

      {room.roomType === RoomType.PRIVATE && canInvite(myRole) && (
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
            memberIds={members?.map((member) => member.id) ?? room.participants ?? []}
            isOpen={inviteOpen}
            onClose={() => {
              setInviteOpen(false);
              void loadMembers();
            }}
          />
        </>
      )}

      {members ? (
        <section aria-label="Participants" className="space-y-2">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {isDM ? "People" : "Members"}
            <span className="ml-1.5 font-mono normal-case tracking-normal">{members.length}</span>
          </h4>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">{members.map(memberRow)}</ul>
        </section>
      ) : (
        isMember && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm" role="alert">
            <span className="text-muted-foreground">Could not load the members.</span>
            <Button variant="outline" size="sm" onClick={() => void loadMembers()}>
              <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {!isMember && (
          <Button onClick={() => void handleJoin()} disabled={busy} className="w-full">
            <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Join room
          </Button>
        )}
        {mayEdit && (
          <Button onClick={() => setView("settings")} variant="outline" className="w-full">
            <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
            Room settings
          </Button>
        )}
        {isMember && !isDM && (
          <Button
            onClick={() => setPending({ kind: "leave" })}
            disabled={busy}
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Leave room
          </Button>
        )}
      </div>
    </>
  );

  const settingsView = room && (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setView("info")}>
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        Back to room info
      </Button>
      <h3 className="font-display text-xl font-semibold">Room settings</h3>
      <div className="space-y-2">
        <Label htmlFor="room-panel-name">Room name</Label>
        <Input
          id="room-panel-name"
          value={form.roomName}
          onChange={(event) => change("roomName", event.target.value)}
          placeholder="Enter room name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="room-panel-description">Description</Label>
        <textarea
          id="room-panel-description"
          value={form.description}
          onChange={(event) => change("description", event.target.value)}
          placeholder="Enter room description"
          className="min-h-[80px] w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="room-panel-size">Maximum members (0 = unlimited)</Label>
        <Input
          id="room-panel-size"
          type="number"
          min="0"
          value={form.maxUsers}
          onChange={(event) => change("maxUsers", parseInt(event.target.value) || 0)}
        />
        {form.maxUsers > 0 && members && form.maxUsers < members.length && (
          <p className="text-xs text-warning">This is fewer than the current {members.length} members.</p>
        )}
      </div>
      <Button type="submit" disabled={!isDirty || busy || form.roomName.trim().length === 0} className="w-full">
        <Save className="mr-2 h-4 w-4" aria-hidden="true" />
        Save changes
      </Button>

      {mayDelete && (
        <div className="rounded-lg border border-destructive/30 bg-danger-surface p-4">
          <h4 className="mb-1 text-sm font-semibold text-destructive">Delete room</h4>
          <p className="mb-3 text-sm text-destructive">
            Deleting is permanent. Every member loses the room and its messages.
          </p>
          <Button
            type="button"
            onClick={() => setPending({ kind: "delete" })}
            disabled={busy}
            variant="destructive"
            className="w-full"
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Delete room
          </Button>
        </div>
      )}
    </form>
  );

  const content = (
    <div className="space-y-5">
      {isLoading && !room ? (
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
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : room ? (
        view === "settings" && mayEdit ? settingsView : infoView
      ) : (
        <div className="text-center text-muted-foreground">Room not found</div>
      )}

      {room && (
        <>
          <LeaveRoomConfirm
            open={pending?.kind === "leave"}
            onOpenChange={(open) => !open && setPending(null)}
            roomId={room.id}
            roomName={title}
            roomType={room.roomType}
            myRole={myRole}
            myUserId={user?.id}
            members={members ?? undefined}
            onConfirm={() => void handleLeave()}
          />
          <ConfirmDialog
            open={pending?.kind === "delete"}
            onOpenChange={(open) => !open && setPending(null)}
            title={`Delete ${title}?`}
            description="The room and its messages are removed for everyone. This cannot be undone."
            confirmLabel="Delete room"
            destructive
            onConfirm={() => void handleDelete()}
          />
          <ConfirmDialog
            open={pending?.kind === "remove"}
            onOpenChange={(open) => !open && setPending(null)}
            title={pending?.kind === "remove" ? `Remove ${memberName(pending.member)}?` : "Remove member?"}
            description="They lose access to the room right away."
            confirmLabel="Remove"
            destructive
            onConfirm={() => {
              if (pending?.kind === "remove") void handleRemove(pending.member);
            }}
          />
        </>
      )}
    </div>
  );

  const heading = view === "settings" && mayEdit ? "Room settings" : "Room information";

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto" onCloseAutoFocus={handleCloseAutoFocus}>
          <SheetHeader className="sr-only">
            <SheetTitle>{heading}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[88dvh] max-w-md gap-4 overflow-y-auto rounded-2xl"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
