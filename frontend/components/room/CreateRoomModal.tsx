"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Globe, Hash, Lock, Minus, Plus } from "lucide-react";
import { useAuthStore, useChatRoomsStore } from "@/lib/stores";
import { CreateChatRoomRequest, RoomType } from "@/lib/types";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "../ui/checkbox";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { cn } from "@/lib/utils";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GroupRoomType = RoomType.PUBLIC | RoomType.PRIVATE;

const TYPES: { value: GroupRoomType; icon: typeof Globe; title: string; body: string }[] = [
  { value: RoomType.PUBLIC, icon: Globe, title: "Public", body: "Anyone can find it in Discover and join." },
  { value: RoomType.PRIVATE, icon: Lock, title: "Private", body: "Hidden from Discover. Members only." },
];

const SIZES = [
  { label: "Small", value: 10 },
  { label: "Group", value: 50 },
  { label: "Community", value: 200 },
];

const MIN_USERS = 2;
const MAX_USERS = 1000;
const MIN_NAME = 3;

/** "New room": a group room (public or private). Direct messages have their own flow (NewMessageDialog). */
export const CreateRoomModal = ({ isOpen, onClose }: CreateRoomModalProps) => {
  const router = useRouter();
  const createRoom = useChatRoomsStore((state) => state.createRoom);
  const currentUser = useAuthStore((state) => state.user);

  const [roomName, setRoomName] = useState("");
  const [description, setDescription] = useState("");
  const [roomType, setRoomType] = useState<GroupRoomType>(RoomType.PUBLIC);
  const [maxUser, setMaxUser] = useState(50);
  const [moreOpen, setMoreOpen] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [allowFileSharing, setAllowFileSharing] = useState(false);
  const [allowGuestUsers, setAllowGuestUsers] = useState(false);
  const [moderationRequired, setModerationRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const name = roomName.trim();
  const valid = name.length >= MIN_NAME;
  const clamp = (value: number) => Math.min(MAX_USERS, Math.max(MIN_USERS, value));

  const reset = () => {
    setRoomName("");
    setDescription("");
    setRoomType(RoomType.PUBLIC);
    setMaxUser(50);
    setMoreOpen(false);
    setWelcomeMessage("");
    setAllowFileSharing(false);
    setAllowGuestUsers(false);
    setModerationRequired(false);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || submitting) return;
    const request: CreateChatRoomRequest = {
      roomName: name,
      description: description.trim(),
      roomType,
      maxUsers: maxUser,
      settings: { welcomeMessage, allowFileSharing, allowGuestUsers, moderationRequired },
    };
    setSubmitting(true);
    const success = await createRoom(request);
    setSubmitting(false);
    if (!success) return;
    const created = useChatRoomsStore
      .getState()
      .rooms.find((room) => room.roomName === name && room.roomType === roomType && room.createdBy === currentUser?.id);
    reset();
    onClose();
    if (created) router.push(`/dashboard?roomId=${created.id}`, { scroll: false });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[820px]">
        <form onSubmit={handleCreate} className="grid md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6 p-6 sm:p-7">
            <div>
              <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.02em]">New room</DialogTitle>
              <DialogDescription className="mt-1">A place for a group. You can change all of this later.</DialogDescription>
            </div>

            <div className="space-y-2">
              <Label htmlFor="room-name">Room name</Label>
              <Input
                id="room-name"
                autoFocus
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. weekend-hike, cs101-study"
                maxLength={60}
                aria-describedby="room-name-hint"
                className="h-11 rounded-xl"
              />
              <p id="room-name-hint" className="text-xs text-muted-foreground">
                At least {MIN_NAME} characters.
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Who can join</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {TYPES.map(({ value, icon: Icon, title, body }) => {
                  const selected = roomType === value;
                  return (
                    <label
                      key={value}
                      className={cn(
                        "relative flex cursor-pointer gap-3 rounded-xl border p-4 transition-all has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
                        selected
                          ? "border-primary bg-accent shadow-[0_8px_24px_-14px_rgb(11_107_93/0.7)]"
                          : "border-border hover:border-primary/40 hover:bg-accent/40"
                      )}
                    >
                      <input
                        type="radio"
                        name="room-type"
                        value={value}
                        checked={selected}
                        onChange={() => setRoomType(value)}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          "grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg",
                          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="block text-xs text-muted-foreground">{body}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Size</legend>
              <div className="flex flex-wrap items-center gap-2">
                {SIZES.map((size) => (
                  <button
                    key={size.value}
                    type="button"
                    aria-pressed={maxUser === size.value}
                    onClick={() => setMaxUser(size.value)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      maxUser === size.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    {size.label} <span className="font-mono text-xs tabular opacity-75">{size.value}</span>
                  </button>
                ))}
                <div className="ml-auto flex items-center rounded-full border border-border">
                  <button
                    type="button"
                    aria-label="Decrease maximum members"
                    onClick={() => setMaxUser((v) => clamp(v - 1))}
                    disabled={maxUser <= MIN_USERS}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <label htmlFor="maxUser" className="sr-only">
                    Maximum members
                  </label>
                  <input
                    id="maxUser"
                    type="number"
                    min={MIN_USERS}
                    max={MAX_USERS}
                    value={maxUser}
                    onChange={(e) => setMaxUser(clamp(Number(e.target.value) || MIN_USERS))}
                    className="w-14 bg-transparent text-center font-mono text-sm tabular outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    aria-label="Increase maximum members"
                    onClick={() => setMaxUser((v) => clamp(v + 1))}
                    disabled={maxUser >= MAX_USERS}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this room for?"
                maxLength={200}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="rounded-xl border border-border">
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-controls="room-more-options"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium hover:bg-accent/50"
              >
                More options
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              {moreOpen && (
                <div id="room-more-options" className="space-y-4 border-t border-border px-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Welcome message</Label>
                    <Input
                      id="welcomeMessage"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="Say hello to new members"
                      className="rounded-xl"
                    />
                  </div>
                  {[
                    { id: "allowFileSharing", label: "Allow file sharing", checked: allowFileSharing, set: setAllowFileSharing },
                    { id: "allowGuestUsers", label: "Allow guest users", checked: allowGuestUsers, set: setAllowGuestUsers },
                    { id: "moderationRequired", label: "Require moderation", checked: moderationRequired, set: setModerationRequired },
                  ].map((option) => (
                    <div key={option.id} className="flex items-center gap-2.5">
                      <Checkbox
                        id={option.id}
                        checked={option.checked}
                        onCheckedChange={(checked) => option.set(checked === true)}
                      />
                      <Label htmlFor={option.id} className="font-normal">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside
            aria-label="Preview"
            className="flex flex-col justify-between gap-6 border-t border-border bg-gradient-to-b from-accent/70 to-secondary p-6 md:border-t-0 md:border-l"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Preview</p>
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-[0_18px_40px_-24px_rgb(15_31_28/0.45)] ring-1 ring-border">
                <div className="flex items-center gap-3">
                  <RoomAvatar name={name || "#"} className="h-11 w-11 rounded-xl" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-display text-lg font-semibold">
                      {roomType === RoomType.PRIVATE ? (
                        <Lock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <Hash className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="truncate">{name || "your-room"}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {description.trim() || (roomType === RoomType.PRIVATE ? "Private room" : "Public room")}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted px-2.5 py-2">
                    <dt className="text-muted-foreground">Members</dt>
                    <dd className="font-mono font-medium tabular">1/{maxUser}</dd>
                  </div>
                  <div className="rounded-lg bg-muted px-2.5 py-2">
                    <dt className="text-muted-foreground">Visibility</dt>
                    <dd className="font-medium">{roomType === RoomType.PRIVATE ? "Members only" : "Discoverable"}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={!valid || submitting}
                className="h-11 flex-1 rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to font-semibold shadow-[0_8px_20px_-8px_rgb(11_107_93/0.7)]"
              >
                {submitting ? "Creating…" : "Create room"}
              </Button>
            </div>
          </aside>
        </form>
      </DialogContent>
    </Dialog>
  );
};
