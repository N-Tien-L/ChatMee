"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Inbox, Lock, MessageCircle, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useInboxStore } from "@/lib/stores/inboxStore";

const ROW = "flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm";
const ACCEPT =
  "rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:brightness-110 active:scale-95 disabled:opacity-50";
const DECLINE = "rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50";

/** Invitations to private rooms and direct-message requests waiting for you (SPEC-009; D-16). */
export function InboxDialog() {
  const router = useRouter();
  const isOpen = useInboxStore((state) => state.isOpen);
  const close = useInboxStore((state) => state.close);
  const invitations = useInboxStore((state) => state.invitations);
  const requests = useInboxStore((state) => state.requests);
  const loading = useInboxStore((state) => state.loading);
  const error = useInboxStore((state) => state.error);
  const pending = useInboxStore((state) => state.pending);
  const fetchInbox = useInboxStore((state) => state.fetchInbox);
  const acceptInvitation = useInboxStore((state) => state.acceptInvitation);
  const declineInvitation = useInboxStore((state) => state.declineInvitation);
  const acceptRequest = useInboxStore((state) => state.acceptRequest);
  const declineRequest = useInboxStore((state) => state.declineRequest);

  const openRoom = (roomId: string | null) => {
    if (!roomId) return;
    close();
    router.push(`/dashboard?roomId=${roomId}`, { scroll: false });
  };

  const empty = !loading && !error && invitations.length === 0 && requests.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[88dvh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[520px]">
        <div className="border-b border-border bg-gradient-to-br from-accent to-card px-6 pt-6 pb-5">
          <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.02em]">Inbox</DialogTitle>
          <DialogDescription>Invitations to private rooms and people who want to message you.</DialogDescription>
        </div>

        <div className="space-y-6 px-6 py-5">
          {error && (
            <div role="alert" className="flex items-center gap-3 rounded-xl bg-danger-surface px-4 py-3 text-sm text-destructive">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => void fetchInbox()} className="flex items-center gap-1 font-semibold underline">
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
              </button>
            </div>
          )}

          {loading && invitations.length === 0 && requests.length === 0 && (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              Checking your inbox…
            </p>
          )}

          {empty && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary">
                <Inbox className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="font-display text-lg font-semibold">All caught up</p>
              <p className="max-w-[300px] text-sm text-muted-foreground">
                When someone invites you to a private room or wants to message you, it shows up here.
              </p>
            </div>
          )}

          {invitations.length > 0 && (
            <section aria-labelledby="inbox-invitations">
              <h3 id="inbox-invitations" className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" /> Room invitations
              </h3>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {invitations.map((invitation) => {
                    const busy = pending.includes(invitation.id);
                    return (
                      <motion.li
                        key={invitation.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 24 }}
                        className={ROW}
                      >
                        <RoomAvatar name={invitation.room.name} className="h-11 w-11 rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{invitation.room.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {invitation.inviter.name} invited you · {invitation.room.memberCount} members ·{" "}
                            <RelativeTime value={invitation.createdAt} />
                          </p>
                        </div>
                        <button type="button" disabled={busy} onClick={() => void declineInvitation(invitation.id)} className={DECLINE}>
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => openRoom(await acceptInvitation(invitation.id))}
                          className={ACCEPT}
                        >
                          Join
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </section>
          )}

          {requests.length > 0 && (
            <section aria-labelledby="inbox-requests">
              <h3 id="inbox-requests" className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                <MessageCircle className="h-3 w-3" aria-hidden="true" /> Message requests
              </h3>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {requests.map((request) => {
                    const busy = pending.includes(request.roomId);
                    return (
                      <motion.li
                        key={request.roomId}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 24 }}
                        className={ROW}
                      >
                        <UserAvatar name={request.sender.name} avatarUrl={request.sender.avatarUrl} size="lg" className="h-11 w-11" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{request.sender.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {request.preview ? `“${request.preview}”` : "Wants to message you"} · <RelativeTime value={request.createdAt} />
                          </p>
                        </div>
                        <button type="button" disabled={busy} onClick={() => void declineRequest(request.roomId)} className={DECLINE}>
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => openRoom(await acceptRequest(request.roomId))}
                          className={ACCEPT}
                        >
                          Accept
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
