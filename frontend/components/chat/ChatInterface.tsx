"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatRoomsStore, RoomEndReason } from "@/lib/stores/chatRoomsStore";
import { useRoomMessages, useRoomMemberNames } from "@/hooks/useRoomMessage";
import { useChatStore } from "@/lib/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useUsersStore } from "@/lib/stores/usersStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { RoomPanel } from "@/components/room/RoomPanel";
import { ReportDialog, ReportTarget } from "@/components/safety/ReportDialog";
import { Button } from "@/components/ui/button";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import TypingIndicator from "./TypingIndicator";
import MessageInput from "./MessageInput";
import { MessageType, RoomType } from "@/lib/types";

/** Typing indicator: how long a typing user is shown after the last event, in ms (SPEC-005 AC-005-5). */
const SELF_TYPING_IDLE_MS = 2000;
/** Minimum gap between "typing: true" frames. The server allows 10 typing frames per 5 s per user (CM-056). */
const TYPING_SEND_INTERVAL_MS = 1000;

interface EndedState {
  roomId: string;
  /** Known locally (the room topic announced the deletion); otherwise the user event's reason is used. */
  reason: RoomEndReason | null;
}

/** Ended-view copy per `ROOM_REMOVED` reason (SPEC-008 AC-008-4, SPEC-009 AC-009-12/13). */
const ENDED_COPY: Record<RoomEndReason, string> = {
  DELETED: "This room was deleted",
  REMOVED: "You are no longer a member",
  LEFT: "You left this room",
  HIDDEN: "You hid this conversation",
  DECLINED: "Your message request was declined",
  EXPIRED: "Your message request expired without an answer",
};

interface ChatInterfaceProps {
  roomId: string;
}

// Room hooks live in ChatRoomView, so leaving or deleting a room (which removes it from the
// store) unmounts them and releases the room's STOMP subscriptions.
const ChatInterface: React.FC<ChatInterfaceProps> = ({ roomId }) => {
  const roomExists = useChatRoomsStore((state) =>
    state.rooms.some((room) => room.id === roomId)
  );
  const eventReason = useChatRoomsStore((state) => state.endedRooms[roomId]);
  const [ended, setEnded] = useState<EndedState | null>(null);
  // The room this view has shown; a room that disappears after being shown has ended (UX-17).
  const shownRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (roomExists) {
      shownRoomRef.current = roomId;
      return;
    }
    if (shownRoomRef.current === roomId) {
      setEnded((previous) =>
        previous?.roomId === roomId ? previous : { roomId, reason: null }
      );
    }
  }, [roomExists, roomId]);

  // Without any reason (e.g. a refetch dropped the room) the user is no longer a member.
  const endedReason = ended?.roomId === roomId ? ended.reason ?? eventReason ?? "REMOVED" : null;
  if (endedReason) return <RoomEndedView reason={endedReason} />;

  if (!roomExists)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">Room not found</div>
      </div>
    );

  return (
    <ChatRoomView
      roomId={roomId}
      onDeleted={() => setEnded({ roomId, reason: "DELETED" })}
    />
  );
};

const RoomEndedView: React.FC<{ reason: RoomEndReason }> = ({ reason }) => (
  <div className="flex items-center justify-center h-full p-6">
    <p role="status" className="text-center text-muted-foreground">
      {ENDED_COPY[reason]}
    </p>
  </div>
);

/** Read-only notice for the blocker of a DM, with the way back (SPEC-009 AC-009-19). */
const BlockedDmBanner: React.FC<{ name: string; onUnblock: () => void }> = ({ name, onUnblock }) => (
  <div
    role="status"
    className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2.5 text-sm sm:mx-7"
  >
    <span className="text-muted-foreground">You blocked {name}. Unblock them to send messages.</span>
    <Button size="sm" variant="outline" onClick={onUnblock}>
      Unblock
    </Button>
  </div>
);

const ChatRoomView: React.FC<{ roomId: string; onDeleted: () => void }> = ({
  roomId,
  onDeleted,
}) => {
  const deleteRoom = useChatRoomsStore((state) => state.deleteRoom);
  const handleRoomDeleted = useCallback(() => {
    onDeleted();
    deleteRoom(roomId);
  }, [deleteRoom, roomId, onDeleted]);
  const {
    messages,
    connected,
    sendMessage,
    resendMessage,
    discardMessage,
    reload,
    loadOlder,
    loading,
    error,
    hasMoreMessages,
    loadingOlder,
    olderError,
  } = useRoomMessages(roomId, { onRoomDeleted: handleRoomDeleted });
  const [newMessage, setNewMessage] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const unblockUser = useUsersStore((state) => state.unblockUser);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef(0);
  useEffect(
    () => () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    },
    []
  );

  // Get rooms
  const currentRoom = useChatRoomsStore((state) =>
    state.rooms.find((room) => room.id === roomId)
  );
  const currentUserId = useAuthStore((state) => state.user?.id);
  const memberCount = currentRoom?.participants?.length ?? 0;
  // The blocker's DM is read-only while the block exists (SPEC-009 AC-009-19); the blocked user gets the generic send error.
  const blocked = currentRoom?.roomType === RoomType.DIRECT_MESSAGE && currentRoom.blocked === true;
  // A pending DM request allows the sender one message (SPEC-009 AC-009-10). It counts as used once the room has a
  // lastMessage or this view holds an own message that did not fail; ROOM_UPDATED {state: ACTIVE} lifts the lock.
  const requestUsed =
    currentRoom?.state === "REQUESTED" &&
    (!!currentRoom.lastMessage ||
      messages.some((m) => m.senderId === currentUserId && m.type !== MessageType.SYSTEM && m.status !== "failed"));
  const memberNames = useRoomMemberNames(roomId, memberCount);

  // Get user cache for names
  const { getUserFromCache } = useUsersStore();

  // Typing helpers over the app's single STOMP session
  const { sendTyping, subscribeTyping, connected: wsConnected } = useWebSocket();

  // Get chat store state
  const { onlineUsers, presenceLoaded, typingUsers, clearTyping } = useChatStore(
    useShallow((state) => ({
      onlineUsers: state.onlineUsers,
      presenceLoaded: state.presenceLoaded,
      typingUsers: state.typingUsers,
      clearTyping: state.clearTyping,
    }))
  );

  // Subscribe to typing events for current room
  useEffect(() => {
    if (!roomId) return;
    return subscribeTyping(roomId);
  }, [roomId, subscribeTyping]);

  // Typing entries belong to the room they were seen in.
  useEffect(() => () => clearTyping(roomId), [roomId, clearTyping]);

  // Get typing users, user names for current room
  const typingUsersList = Array.from(typingUsers[roomId] || new Set<string>());
  const typingUserNames = typingUsersList
    .map((userId) => memberNames[userId] ?? getUserFromCache(userId)?.name ?? "Someone")
    .slice(0, 3); // Limit to 3 names to avoid cluttering

  // Typing detection logic
  const handleTyping = useCallback(
    (typing: boolean) => {
      // A stop frame always goes out, so the next start is never throttled.
      if (!typing) lastTypingSentRef.current = 0;
      if (wsConnected && roomId) {
        sendTyping(roomId, typing);
      }
    },
    [wsConnected, roomId, sendTyping]
  );

  // Input change event handler
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (value.trim()) {
      // Throttled: a frame per keystroke would exhaust the server budget and drop the stop frame.
      const now = Date.now();
      if (now - lastTypingSentRef.current >= TYPING_SEND_INTERVAL_MS) {
        lastTypingSentRef.current = now;
        handleTyping(true);
      }
      typingTimeoutRef.current = setTimeout(() => handleTyping(false), SELF_TYPING_IDLE_MS);
    } else handleTyping(false);
  };

  // Send message handler
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !connected || requestUsed || blocked) return;

    // Stop typing indicator when sending message
    handleTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    sendMessage(newMessage.trim());
    setNewMessage("");
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  };

  if (!currentRoom)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">Room not found</div>
      </div>
    );

  const onlineCount =
    currentRoom.participants?.filter((id) => onlineUsers.has(id)).length || 0;
  const counterpartOnline = currentRoom.counterpart
    ? onlineUsers.has(currentRoom.counterpart.id)
    : false;

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      <ChatHeader
        room={currentRoom}
        memberCount={memberCount}
        onlineCount={onlineCount}
        presenceKnown={presenceLoaded}
        counterpartOnline={counterpartOnline}
        onOpenInfo={() => setShowInfo(true)}
        onlineMembers={(currentRoom.participants ?? [])
          .filter((id) => onlineUsers.has(id))
          .map((id) => ({ id, name: memberNames[id] ?? getUserFromCache(id)?.name ?? "Member", avatarUrl: getUserFromCache(id)?.avatarUrl }))}
      />
      <RoomPanel roomId={roomId} isOpen={showInfo} onClose={() => setShowInfo(false)} />

      {/* MessageList owns the scroll container (load older on scroll to top, CM-044). */}
      <div className="flex-1 min-h-0">
        <MessageList
          messages={messages}
          onlineUsers={onlineUsers}
          presenceKnown={presenceLoaded}
          formatDate={formatDate}
          formatTime={formatTime}
          messagesEndRef={messagesEndRef}
          loading={loading}
          error={error}
          onRetryLoad={reload}
          onResend={resendMessage}
          onDiscard={discardMessage}
          canResend={connected && !requestUsed && !blocked}
          hasMore={hasMoreMessages}
          loadingOlder={loadingOlder}
          olderError={olderError}
          onLoadOlder={loadOlder}
          onReport={(message) => setReport({ type: "MESSAGE", id: message.id, label: `message from ${message.senderName || "this member"}` })}
          directWith={
            currentRoom.roomType === RoomType.DIRECT_MESSAGE && currentRoom.counterpart
              ? { name: currentRoom.counterpart.name, avatarUrl: currentRoom.counterpart.avatarUrl }
              : null
          }
        />
      </div>

      <TypingIndicator
        typingUserNames={typingUserNames}
        typingUsersCount={typingUsersList.length}
      />

      {blocked && currentRoom.counterpart && (
        <BlockedDmBanner
          name={currentRoom.counterpart.name}
          onUnblock={() => currentRoom.counterpart && void unblockUser(currentRoom.counterpart)}
        />
      )}
      <ReportDialog target={report} onClose={() => setReport(null)} />

      <MessageInput
        value={newMessage}
        onChange={handleInputChange}
        onSubmit={handleSendMessage}
        disabled={!newMessage.trim() || !connected || requestUsed || blocked}
        inputDisabled={requestUsed || blocked}
        inputRef={inputRef}
        // When blocked, the BlockedDmBanner above is the hint; the request hint would be misleading next to it.
        pausedHint={
          blocked
            ? null
            : requestUsed
              ? `Request sent. You can send more messages once ${currentRoom.counterpart?.name || currentRoom.displayName || "they"} accepts.`
              : !connected && !loading
                ? "Reconnecting. Keep typing; sending resumes when the connection is back."
                : null
        }
      />
    </div>
  );
};

export default ChatInterface;
