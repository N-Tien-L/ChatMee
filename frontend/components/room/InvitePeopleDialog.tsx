"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RelativeTime } from "@/components/common/RelativeTime";
import { invitationApi } from "@/lib/api/invitationApi";
import { useAuthStore } from "@/lib/stores/authStore";
import { InvitationResponse } from "@/lib/types";
import { InvitePeople } from "./InvitePeople";

interface InvitePeopleDialogProps {
  roomId: string;
  roomName: string;
  /** Current members (never offered again). */
  memberIds: string[];
  isOpen: boolean;
  onClose: () => void;
}

/** Invite people to a PRIVATE room and see who is still invited (OWNER/ADMIN; SPEC-009 AC-009-1, AC-009-3). */
export function InvitePeopleDialog({ roomId, roomName, memberIds, isOpen, onClose }: InvitePeopleDialogProps) {
  const me = useAuthStore((state) => state.user);
  const [pending, setPending] = useState<InvitationResponse[]>([]);

  const loadPending = useCallback(async () => {
    try {
      const response = await invitationApi.listForRoom(roomId);
      if (response.success) setPending(response.data);
    } catch {
      // The list is a convenience; inviting still works without it.
    }
  }, [roomId]);

  useEffect(() => {
    if (isOpen) void loadPending();
  }, [isOpen, loadPending]);

  const excludeIds = useMemo(
    () => [...memberIds, ...(me ? [me.id] : []), ...pending.map((p) => p.invitee.id)],
    [memberIds, me, pending]
  );

  const revoke = async (invitation: InvitationResponse) => {
    try {
      await invitationApi.revoke(invitation.id);
      setPending((list) => list.filter((p) => p.id !== invitation.id));
      toast.success(`Invitation to ${invitation.invitee.name} withdrawn`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not withdraw the invitation");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[500px] [&>*]:min-w-0">
        <div className="border-b border-border bg-gradient-to-br from-accent to-card px-6 pt-6 pb-5">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to text-primary-foreground">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.02em]">Invite people</DialogTitle>
          <DialogDescription>
            To <span className="font-medium text-foreground">{roomName}</span>. They join when they accept from their inbox.
          </DialogDescription>
        </div>
        <div className="space-y-5 px-6 py-5">
          <InvitePeople roomId={roomId} excludeIds={excludeIds} onSent={() => void loadPending()} />
          {pending.length > 0 && (
            <section aria-labelledby="pending-invites">
              <h3 id="pending-invites" className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Waiting for an answer
              </h3>
              <ul className="space-y-1">
                {pending.map((invitation) => (
                  <li key={invitation.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                    <UserAvatar name={invitation.invitee.name} avatarUrl={invitation.invitee.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1 truncate text-sm">{invitation.invitee.name}</span>
                    <RelativeTime value={invitation.createdAt} className="font-mono text-[11px] text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => void revoke(invitation)}
                      aria-label={`Withdraw invitation to ${invitation.invitee.name}`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
