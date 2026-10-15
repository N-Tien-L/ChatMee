"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, Globe, Hash, Lock, Minus, Plus, Users } from "lucide-react";
import { useAuthStore, useChatRoomsStore } from "@/lib/stores";
import { CreateChatRoomRequest, RoomType, UserSummaryResponse } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "../ui/checkbox";
import { RoomCover } from "@/components/common/RoomCover";
import { RoomAvatar } from "@/components/common/RoomAvatar";
import { UserAvatar } from "@/components/common/UserAvatar";
import { cn } from "@/lib/utils";
import { InvitePeople } from "./InvitePeople";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GroupRoomType = RoomType.PUBLIC | RoomType.PRIVATE;
type Step = "details" | "invite";

const TYPES: { value: GroupRoomType; icon: typeof Globe; title: string; body: string }[] = [
  { value: RoomType.PUBLIC, icon: Globe, title: "Public", body: "Anyone can find it in Discover and join." },
  { value: RoomType.PRIVATE, icon: Lock, title: "Private", body: "Hidden from Discover. You invite people." },
];

const DEFAULT_SIZE = 50;
const MIN_USERS = 2;
const MAX_USERS = 1000;
const MIN_NAME = 3;

const field =
  "h-11 w-full rounded-xl border border-border bg-muted/50 px-4 text-[15px] transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-[3px] focus:ring-ring/20 focus:outline-none";

/**
 * "New room" (D-16): details with a live preview. Creating closes the dialog and opens the room; people are
 * invited from the room's info.
 * Direct messages have their own flow (NewMessageDialog); a room's size sits under More options.
 */
export const CreateRoomModal = ({ isOpen, onClose }: CreateRoomModalProps) => {
  const router = useRouter();
  const createRoom = useChatRoomsStore((state) => state.createRoom);
  const currentUser = useAuthStore((state) => state.user);

  const [roomName, setRoomName] = useState("");
  const [description, setDescription] = useState("");
  const [roomType, setRoomType] = useState<GroupRoomType>(RoomType.PRIVATE);
  const [maxUser, setMaxUser] = useState(DEFAULT_SIZE);
  const [moreOpen, setMoreOpen] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [allowFileSharing, setAllowFileSharing] = useState(false);
  const [moderationRequired, setModerationRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [invited, setInvited] = useState<UserSummaryResponse[]>([]);

  const name = roomName.trim();
  const valid = name.length >= MIN_NAME;
  const clamp = (value: number) => Math.min(MAX_USERS, Math.max(MIN_USERS, value));
  const isPrivate = roomType === RoomType.PRIVATE;

  const reset = () => {
    setRoomName("");
    setDescription("");
    setRoomType(RoomType.PRIVATE);
    setMaxUser(DEFAULT_SIZE);
    setMoreOpen(false);
    setWelcomeMessage("");
    setAllowFileSharing(false);
    setModerationRequired(false);
    setStep("details");
    setCreatedId(null);
    setInvited([]);
  };

  const finish = (roomId: string | null) => {
    reset();
    onClose();
    if (roomId) router.push(`/dashboard?roomId=${roomId}`, { scroll: false });
  };

  // Closing the dialog after the room exists opens that room, so the user never loses the room they just made.
  const close = () => {
    if (step === "invite") finish(createdId);
    else onClose();
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || submitting) return;
    const request: CreateChatRoomRequest = {
      roomName: name,
      description: description.trim(),
      roomType,
      maxUsers: maxUser,
      settings: { welcomeMessage, allowFileSharing, allowGuestUsers: false, moderationRequired },
    };
    setSubmitting(true);
    const created = await createRoom(request);
    setSubmitting(false);
    if (!created) return;
    // Public rooms are found through Discover, so they stop here. Private rooms offer the invite step (Slack, Discord, Teams).
    if (isPrivate) {
      setCreatedId(created.id);
      setStep("invite");
      return;
    }
    finish(created.id);
  };

  const preview = (
    <aside aria-label="Preview" className="relative flex flex-col gap-4 border-t border-border bg-muted/40 p-5 md:border-t-0 md:border-l">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">How it will look</p>
      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_24px_50px_-28px_rgb(0_0_0/0.6)] ring-1 ring-border">
        <RoomCover name={name || "your-room"} className="h-24" />
        <div className="-mt-8 px-5 pb-5">
          <RoomAvatar name={name || "#"} className="h-14 w-14 rounded-2xl ring-4 ring-card" />
          <p className="mt-3 flex items-center gap-1.5 font-display text-xl font-semibold">
            {isPrivate ? (
              <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Hash className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="truncate">{name || "your-room"}</span>
          </p>
          <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
            {description.trim() || (isPrivate ? "A private room for people you invite." : "An open room anyone can join.")}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex -space-x-2">
              {currentUser && <UserAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} size="md" className="ring-2 ring-card" />}
            </div>
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" aria-hidden="true" />
              {isPrivate ? "Members only" : "Discoverable"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[780px] [&>*]:min-w-0 focus-visible:outline-none">
        <div className="grid md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="p-5 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
            {step === "details" ? (
            <motion.form
              key="details"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleCreate}
              className="space-y-5"
            >
              <div>
                <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.02em]">New room</DialogTitle>
                <DialogDescription className="mt-1">
                  A place for a group. For one person, use <span className="font-medium text-foreground">Message</span>{" "}
                  instead.
                </DialogDescription>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="room-name" className="block leading-5">Room name</Label>
                <input
                  id="room-name"
                  autoFocus
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. weekend-hike, cs101-study"
                  maxLength={60}
                  aria-describedby="room-name-hint"
                  className={field}
                />
                <p id="room-name-hint" className="text-xs text-muted-foreground">
                  At least {MIN_NAME} characters. The room&apos;s colour comes from its name.
                </p>
              </div>

              <fieldset>
                <legend className="mb-2.5 text-sm font-medium leading-5">Who can join</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {TYPES.map(({ value, icon: Icon, title, body }) => {
                    const selected = roomType === value;
                    return (
                      <label
                        key={value}
                        className={cn(
                          "relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition-all has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
                          selected
                            ? "border-primary bg-accent shadow-[0_10px_30px_-16px_var(--primary)]"
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
                            "grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl transition-colors",
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

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-2.5">
                <Label htmlFor="maxUser" className="leading-5">Maximum members</Label>
                <div className="flex items-center rounded-full border border-border">
                  <button
                    type="button"
                    aria-label="Decrease maximum members"
                    onClick={() => setMaxUser((v) => clamp(v - 5))}
                    disabled={maxUser <= MIN_USERS}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
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
                    onClick={() => setMaxUser((v) => clamp(v + 5))}
                    disabled={maxUser >= MAX_USERS}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="description" className="block leading-5">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this room for?"
                  maxLength={200}
                  rows={2}
                  className={cn(field, "h-auto resize-none py-2.5")}
                />
              </div>

              <div className="rounded-2xl border border-border">
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  aria-controls="room-more-options"
                  onClick={() => setMoreOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium hover:bg-accent/50"
                >
                  <span>
                    More options
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} aria-hidden="true" />
                </button>
                {moreOpen && (
                  <div id="room-more-options" className="space-y-4 border-t border-border px-4 py-4">
                    <div className="space-y-2.5">
                      <Label htmlFor="welcomeMessage" className="block leading-5">Welcome message</Label>
                      <input
                        id="welcomeMessage"
                        value={welcomeMessage}
                        onChange={(e) => setWelcomeMessage(e.target.value)}
                        placeholder="Say hello to new members"
                        className={cn(field, "h-11")}
                      />
                    </div>
                    {[
                      { id: "allowFileSharing", label: "Allow file sharing", checked: allowFileSharing, set: setAllowFileSharing },
                      { id: "moderationRequired", label: "Require moderation", checked: moderationRequired, set: setModerationRequired },
                    ].map((option) => (
                      <div key={option.id} className="flex items-center gap-2.5">
                        <Checkbox id={option.id} checked={option.checked} onCheckedChange={(checked) => option.set(checked === true)} />
                        <Label htmlFor={option.id} className="font-normal">
                          {option.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-xl border border-border px-5 text-sm font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!valid || submitting}
                  className="h-11 flex-1 rounded-xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_-8px_rgb(11_107_93/0.7)] transition-transform hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {submitting ? "Creating…" : isPrivate ? "Create and invite people" : "Create room"}
                </button>
              </div>
            </motion.form>
            ) : (
            <motion.div
              key="invite"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div>
                <DialogTitle className="font-display text-2xl font-semibold tracking-[-0.02em]">Invite people</DialogTitle>
                <DialogDescription className="mt-1">
                  <span className="font-medium text-foreground">{name}</span> is ready. Invite people now or later from the
                  room&apos;s info.
                </DialogDescription>
              </div>
              <InvitePeople
                roomId={createdId}
                excludeIds={[...(currentUser ? [currentUser.id] : []), ...invited.map((person) => person.id)]}
                onSent={(people) => setInvited((list) => [...list, ...people])}
                sendLabel="Send invitations"
                secondary={
                  <button
                    type="button"
                    onClick={() => finish(createdId)}
                    className="flex h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium hover:bg-accent"
                  >
                    {invited.length > 0 ? "Done" : "Skip for now"}
                  </button>
                }
              />
              <button
                type="button"
                onClick={() => finish(createdId)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                Open {name}
              </button>
            </motion.div>
            )}
            </AnimatePresence>
          </div>
          {preview}
        </div>
      </DialogContent>
    </Dialog>
  );
};
