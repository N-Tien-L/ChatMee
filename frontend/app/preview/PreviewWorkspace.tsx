"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/common/AppHeader";
import { ConnectionBanner } from "@/components/realtime/ConnectionBanner";
import ChatRoomsList from "@/components/room/ChatRoomsList";
import { CreateRoomModal } from "@/components/room/CreateRoomModal";
import { NewMessageDialog } from "@/components/room/NewMessageDialog";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageList from "@/components/chat/MessageList";
import TypingIndicator from "@/components/chat/TypingIndicator";
import MessageInput from "@/components/chat/MessageInput";
import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useUsersStore } from "@/lib/stores/usersStore";
import type { ConnectionStatus } from "@/lib/realtime/stompSession";
import { ChatRoom, Message, MessageType, ParticipantRole, RoomType } from "@/lib/types";

// Mock data for the milestone B preview only.
const ME = { id: "u-me", name: "Tien Lam", email: "preview@example.test", avatarUrl: "", provider: "github" };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const settings = { allowFileSharing: false, allowGuestUsers: false, moderationRequired: false, welcomeMessage: "" };

const room = (r: Partial<ChatRoom> & Pick<ChatRoom, "id" | "roomName" | "roomType">): ChatRoom => ({
  createdBy: ME.id,
  createdAt: minutesAgo(60 * 24 * 30),
  maxUsers: 50,
  settings,
  participants: [ME.id, "u-lan", "u-minh"],
  myRole: ParticipantRole.MEMBER,
  ...r,
});

const ROOMS: ChatRoom[] = [
  room({
    id: "r-spring", roomName: "spring-internals", roomType: RoomType.PUBLIC, unreadCount: 0,
    participants: [ME.id, "u-lan", "u-minh", "u-an", "u-bao", "u-chi", "u-duc", "u-ha", "u-khoa", "u-linh", "u-nam", "u-quan"],
    lastActivityAt: minutesAgo(1),
    lastMessage: { id: "m6", senderId: "u-minh", senderName: "Minh Tran", preview: "One. Same tempId, same stored message.", createdAt: minutesAgo(1) },
  }),
  room({
    id: "r-lan", roomName: "dm", displayName: "Lan Pham", roomType: RoomType.DIRECT_MESSAGE, unreadCount: 2,
    counterpart: { id: "u-lan", name: "Lan Pham", avatarUrl: "" },
    lastActivityAt: minutesAgo(4),
    lastMessage: { id: "x1", senderId: "u-lan", senderName: "Lan Pham", preview: "Can you look at the resync test?", createdAt: minutesAgo(4) },
  }),
  room({
    id: "r-guild", roomName: "realtime-guild", roomType: RoomType.PRIVATE, unreadCount: 14, maxUsers: 20,
    lastActivityAt: minutesAgo(18),
    lastMessage: { id: "x2", senderId: "u-an", senderName: "An", preview: "Redis presence TTL is 60 s now", createdAt: minutesAgo(18) },
  }),
  room({
    id: "r-minh", roomName: "dm", displayName: "Khoa Vu", roomType: RoomType.DIRECT_MESSAGE, state: "REQUESTED",
    counterpart: { id: "u-khoa", name: "Khoa Vu", avatarUrl: "" },
    lastActivityAt: minutesAgo(60 * 3),
    lastMessage: { id: "x3", senderId: ME.id, senderName: ME.name, preview: "Hi! Saw your STOMP talk.", createdAt: minutesAgo(60 * 3) },
  }),
  room({
    id: "r-design", roomName: "design-crit", roomType: RoomType.PUBLIC, unreadCount: 0, maxUsers: 0,
    lastActivityAt: minutesAgo(60 * 26),
    lastMessage: { id: "x4", senderId: "u-ha", senderName: "Ha", preview: "Shipping the new tokens Friday", createdAt: minutesAgo(60 * 26) },
  }),
];

const PEOPLE = [
  { id: "u-lan", name: "Lan Pham", avatarUrl: "" },
  { id: "u-khoa", name: "Khoa Vu", avatarUrl: "" },
  { id: "u-minh", name: "Minh Tran", avatarUrl: "" },
  { id: "u-an", name: "An Nguyen", avatarUrl: "" },
  { id: "u-ha", name: "Ha Le", avatarUrl: "" },
];

const msg = (m: Partial<Message> & Pick<Message, "id" | "senderId" | "content" | "createdAt">): Message => ({
  chatRoomId: "r-spring", type: MessageType.TEXT, updatedAt: m.createdAt, isUpdated: false, isDeleted: false, ...m,
});

const INITIAL_MESSAGES: Message[] = [
  msg({ id: "m0", senderId: "system", content: "Minh Tran joined the room", type: MessageType.SYSTEM, createdAt: minutesAgo(60 * 25) }),
  msg({ id: "m1", senderId: "u-lan", senderName: "Lan Pham", content: "Does the resync after a reconnect merge by id, or can I see a message twice?", createdAt: minutesAgo(12) }),
  msg({ id: "m2", senderId: "u-lan", senderName: "Lan Pham", content: "Asking because my phone dropped twice on the train.", createdAt: minutesAgo(11) }),
  msg({ id: "m3", senderId: ME.id, senderName: ME.name, isOwn: true, status: "sent", content: "It merges by id. A pending copy is matched by its clientMessageId.", createdAt: minutesAgo(9) }),
  msg({ id: "m4", senderId: ME.id, senderName: ME.name, isOwn: true, status: "failed", tempId: "t-fail", errorMessage: "Too many messages. Try again in 3 s", content: "And the server keeps (room, sender, clientMessageId) unique.", createdAt: minutesAgo(8) }),
  msg({ id: "m5", senderId: "u-minh", senderName: "Minh Tran", content: "If my resend fires twice, do you get two?", createdAt: minutesAgo(2) }),
  msg({ id: "m6", senderId: "u-minh", senderName: "Minh Tran", content: "One. Same tempId, same stored message.", createdAt: minutesAgo(1) }),
];

const DM_MESSAGES: Message[] = [
  msg({ id: "d1", chatRoomId: "r-lan", senderId: "u-lan", senderName: "Lan Pham", content: "Hey, got a minute?", createdAt: minutesAgo(9) }),
  msg({ id: "d2", chatRoomId: "r-lan", senderId: "u-lan", senderName: "Lan Pham", content: "Can you look at the resync test? It fails only on my laptop.", createdAt: minutesAgo(8) }),
  msg({ id: "d3", chatRoomId: "r-lan", senderId: ME.id, senderName: ME.name, isOwn: true, status: "sent", content: "Sure, push the branch and I'll run it after lunch.", createdAt: minutesAgo(5) }),
  msg({ id: "d4", chatRoomId: "r-lan", senderId: "u-lan", senderName: "Lan Pham", content: "Pushed. Thank you!", createdAt: minutesAgo(4) }),
];

const PENDING_MESSAGES: Message[] = [
  msg({ id: "p1", chatRoomId: "r-minh", senderId: ME.id, senderName: ME.name, isOwn: true, status: "sent", content: "Hi! Saw your STOMP talk.", createdAt: minutesAgo(60 * 3) }),
];

type Conversation = "room" | "dm" | "dm-pending";
const CONVERSATIONS: Record<Conversation, { room: ChatRoom; messages: Message[] }> = {
  room: { room: ROOMS[0], messages: INITIAL_MESSAGES },
  dm: { room: ROOMS[1], messages: DM_MESSAGES },
  "dm-pending": { room: ROOMS[3], messages: PENDING_MESSAGES },
};

type ConversationState = "populated" | "loading" | "error" | "empty";

const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const formatDate = (date: Date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString();
};

/** Server echo delay for the mock send. */
const ECHO_MS = 1200;

export function PreviewWorkspace() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connected");
  const [conversation, setConversation] = useState<ConversationState>("populated");
  const [which, setWhich] = useState<Conversation>("room");
  const [typing, setTyping] = useState(true);
  const [failNext, setFailNext] = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    useAuthStore.setState({ user: ME, isAuthenticated: true });
    useChatRoomsStore.setState({
      rooms: ROOMS,
      filteredRooms: ROOMS,
      loading: false,
      error: null,
      fetchRooms: async () => {},
      markRoomRead: async () => {},
      // Mock create: adds the room locally so both create flows can be tried without a backend.
      createRoom: async (request) => {
        const person = PEOPLE.find((p) => p.id === request.participantId);
        const created = room({
          id: `r-new-${Date.now()}`,
          roomName: request.roomName ?? "new-room",
          roomType: request.roomType,
          maxUsers: request.maxUsers ?? 50,
          participants: [ME.id],
          myRole: ParticipantRole.OWNER,
          lastActivityAt: new Date().toISOString(),
          ...(person ? { displayName: person.name, counterpart: person, state: "REQUESTED" as const } : {}),
        });
        useChatRoomsStore.getState().addRoom(created);
        return true;
      },
    });
    useUsersStore.setState({
      users: PEOPLE,
      filteredUsers: PEOPLE,
      fetchUsers: async (query = "") => {
        const q = query.trim().toLowerCase();
        useUsersStore.setState({ filteredUsers: PEOPLE.filter((p) => p.name.toLowerCase().includes(q)) });
      },
    });
    setReady(true);
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const connected = status === "connected";
  const createOpen = useChatRoomsStore((state) => state.isCreateRoomModalOpen);
  const createMode = useChatRoomsStore((state) => state.createRoomModalMode);

  const pickConversation = (next: Conversation) => {
    setWhich(next);
    setMessages(CONVERSATIONS[next].messages);
  };

  const deliver = (tempId: string) => {
    const fail = failNext;
    setFailNext(false);
    timers.current.push(
      setTimeout(() => {
        setMessages((list) =>
          list.map((m) =>
            m.tempId === tempId
              ? fail
                ? { ...m, status: "failed", errorMessage: "Not delivered. The server did not confirm in time." }
                : { ...m, status: "sent", createdAt: new Date().toISOString() }
              : m
          )
        );
      }, ECHO_MS)
    );
  };

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !connected) return;
    const tempId = `t-${Date.now()}`;
    const now = new Date().toISOString();
    setMessages((list) => [
      ...list,
      msg({ id: tempId, tempId, senderId: ME.id, senderName: ME.name, isOwn: true, status: "sending", content, createdAt: now }),
    ]);
    setDraft("");
    deliver(tempId);
  };

  const resend = (tempId: string) => {
    setMessages((list) => list.map((m) => (m.tempId === tempId ? { ...m, status: "sending", errorMessage: undefined } : m)));
    deliver(tempId);
  };

  const current = CONVERSATIONS[which].room;
  const shown = conversation === "populated" ? messages : [];

  if (!ready) return null;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <AppHeader user={ME} onSignOut={() => {}} status={<ConnectionBanner status={status} />} />
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Chat rooms" className="hidden w-80 flex-shrink-0 border-r bg-sidebar md:block">
          <Suspense fallback={null}>
            <ChatRoomsList />
          </Suspense>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <ChatHeader
            room={current}
            memberCount={current.participants?.length ?? 0}
            onlineCount={5}
            presenceKnown
            counterpartOnline={which === "dm"}
            onOpenInfo={() => {}}
          />
          <div className="min-h-0 flex-1">
            <MessageList
              messages={shown}
              onlineUsers={new Set(["u-minh", "u-lan"])}
              presenceKnown
              formatDate={formatDate}
              formatTime={formatTime}
              messagesEndRef={messagesEndRef}
              loading={conversation === "loading"}
              error={conversation === "error" ? "Network Error" : null}
              onRetryLoad={() => setConversation("populated")}
              onResend={resend}
              onDiscard={(tempId) => setMessages((list) => list.filter((m) => m.tempId !== tempId))}
              canResend={connected}
              hasMore={false}
              onLoadOlder={() => {}}
              directWith={current.roomType === RoomType.DIRECT_MESSAGE && current.counterpart ? current.counterpart : null}
            />
          </div>
          {typing && which !== "dm-pending" && <TypingIndicator typingUserNames={["Lan Pham"]} typingUsersCount={1} />}
          <MessageInput
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onSubmit={send}
            disabled={!draft.trim() || !connected}
            inputRef={inputRef}
            pausedHint={connected ? null : "Reconnecting. Keep typing; sending resumes when the connection is back."}
          />
        </main>
      </div>

      <CreateRoomModal
        isOpen={createOpen && createMode === "room"}
        onClose={() => useChatRoomsStore.getState().closeCreateRoomModal()}
      />
      <NewMessageDialog
        isOpen={createOpen && createMode === "direct"}
        onClose={() => useChatRoomsStore.getState().closeCreateRoomModal()}
      />
      <PreviewControls
        which={which}
        onWhich={pickConversation}
        status={status}
        onStatus={setStatus}
        conversation={conversation}
        onConversation={setConversation}
        typing={typing}
        onTyping={setTyping}
        failNext={failNext}
        onFailNext={setFailNext}
      />
    </div>
  );
}

interface PreviewControlsProps {
  which: Conversation;
  onWhich: (c: Conversation) => void;
  status: ConnectionStatus;
  onStatus: (s: ConnectionStatus) => void;
  conversation: ConversationState;
  onConversation: (c: ConversationState) => void;
  typing: boolean;
  onTyping: (t: boolean) => void;
  failNext: boolean;
  onFailNext: (f: boolean) => void;
}

/** Owner-facing switches; visibly labelled as mock so the preview is never mistaken for live data. */
function PreviewControls(props: PreviewControlsProps) {
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const field = "rounded border border-border bg-card px-1.5 py-1 text-xs";
  return (
    <section
      aria-label="Preview controls"
      className="fixed bottom-3 left-3 z-50 w-60 rounded-md border border-border bg-card p-3 text-xs shadow-lg"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold tracking-[0.1em] text-spot">MOCK DATA · PREVIEW</p>
        <button type="button" className="text-muted-foreground underline" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1">
            Open chat
            <select className={field} value={props.which} onChange={(e) => props.onWhich(e.target.value as Conversation)}>
              <option value="room">room: spring-internals</option>
              <option value="dm">direct: Lan Pham</option>
              <option value="dm-pending">direct: Khoa Vu (request)</option>
            </select>
          </label>
          <label className="grid gap-1">
            Connection
            <select className={field} value={props.status} onChange={(e) => props.onStatus(e.target.value as ConnectionStatus)}>
              <option value="connected">connected</option>
              <option value="connecting">connecting</option>
              <option value="reconnecting">reconnecting</option>
              <option value="disconnected">disconnected</option>
            </select>
          </label>
          <label className="grid gap-1">
            Conversation
            <select className={field} value={props.conversation} onChange={(e) => props.onConversation(e.target.value as ConversationState)}>
              <option value="populated">populated</option>
              <option value="loading">loading</option>
              <option value="error">load error</option>
              <option value="empty">empty</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={props.typing} onChange={(e) => props.onTyping(e.target.checked)} />
            Someone is typing
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={props.failNext} onChange={(e) => props.onFailNext(e.target.checked)} />
            Fail the next send
          </label>
          <p className="text-muted-foreground">Type and press Enter: the tab goes dashed, then confirms after 1.2 s.</p>
        </div>
      )}
    </section>
  );
}
