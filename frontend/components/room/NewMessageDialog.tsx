"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/common/UserAvatar";
import UserSearchList from "@/components/user/UserSearchList";
import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useUsersStore } from "@/lib/stores/usersStore";
import { ChatRoom, RoomType, UserSummaryResponse } from "@/lib/types";

interface NewMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_RECENT = 6;

/**
 * "New message": pick a person. An existing conversation with them opens directly; otherwise a direct message
 * (a request until they accept) is created and opened. Group rooms have their own flow (CreateRoomModal).
 */
export function NewMessageDialog({ isOpen, onClose }: NewMessageDialogProps) {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const rooms = useChatRoomsStore((state) => state.rooms);
  const startDirectMessage = useChatRoomsStore((state) => state.startDirectMessage);
  const [starting, setStarting] = useState<string | null>(null);
  const blockUser = useUsersStore((state) => state.blockUser);

  const directRooms = useMemo(
    () => rooms.filter((room) => room.roomType === RoomType.DIRECT_MESSAGE && room.counterpart),
    [rooms]
  );

  const open = (room: ChatRoom) => {
    onClose();
    router.push(`/dashboard?roomId=${room.id}`, { scroll: false });
  };

  const start = async (person: UserSummaryResponse) => {
    setStarting(person.id);
    const room = await startDirectMessage(person.id);
    setStarting(null);
    if (room) open(room);
  };

  const recent = directRooms.slice(0, MAX_RECENT);
  // Stable array: UserSearchList re-runs an effect whenever this identity changes.
  const excluded = useMemo(() => (currentUser ? [currentUser.id] : []), [currentUser]);

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[480px] [&>*]:min-w-0">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-accent to-card px-6 pt-6 pb-5 text-left">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to text-primary-foreground shadow-[0_10px_24px_-10px_rgb(11_107_93/0.7)]">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.02em]">New message</DialogTitle>
          <DialogDescription>
            Pick a person. If you already talk, you go straight to that conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {recent.length > 0 && (
            <section aria-labelledby="recent-people">
              <h3 id="recent-people" className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Recent
              </h3>
              <ul className="flex gap-3 overflow-x-auto pb-1">
                {recent.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => open(room)}
                      className="flex w-16 flex-col items-center gap-1.5 rounded-xl p-1.5 text-center transition-colors hover:bg-accent"
                    >
                      <UserAvatar name={room.counterpart?.name} avatarUrl={room.counterpart?.avatarUrl} size="lg" />
                      <span className="w-full truncate text-xs text-foreground">
                        {room.counterpart?.name?.split(" ")[0]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Find a person" aria-busy={starting !== null}>
            <UserSearchList
              onUserAdd={(person) => void start(person)}
              excludeUserIds={excluded}
              placeHolder="Search people by name…"
              actionLabel="Message"
              onUserBlock={(person) => void blockUser(person)}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
