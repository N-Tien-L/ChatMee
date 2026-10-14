"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useRoomMessages, useRoomMemberNames } from "@/hooks/useRoomMessage";
import { useChatStore } from "@/lib/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useUsersStore } from "@/lib/stores/usersStore";
import { RoomInfoDialog } from "@/components/room/RoomInfoDialog";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import TypingIndicator from "./TypingIndicator";
import MessageInput from "./MessageInput";

/** Typing indicator: how long a typing user is shown after the last event, in ms (SPEC-005 AC-005-5). */
const SELF_TYPING_IDLE_MS = 2000;

type EndedReason = "removed" | "deleted";
interface EndedState {
  roomId: string;
  reason: EndedReason;
}

interface ChatInterfaceProps {
  roomId: string;
}

// Room hooks live in ChatRoomView, so leaving or deleting a room (which removes it from the
// store) unmounts them and releases the room's STOMP subscriptions.
const ChatInterface: React.FC<ChatInterfaceProps> = ({ roomId }) => {
  const roomExists = useChatRoomsStore((state) =>
    state.rooms.some((room) => room.id === roomId)
  );
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
        previous?.roomId === roomId ? previous : { roomId, reason: "removed" }
      );
    }
  }, [roomExists, roomId]);

  const endedReason = ended?.roomId === roomId ? ended.reason : null;
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
      onDeleted={() => setEnded({ roomId, reason: "deleted" })}
    />
  );
};

const RoomEndedView: React.FC<{ reason: EndedReason }> = ({ reason }) => (
  <div className="flex items-center justify-center h-full p-6">
    <p role="status" className="text-center text-muted-foreground">
      {reason === "deleted" ? "This room was deleted" : "You are no longer a member"}
    </p>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  const memberCount = currentRoom?.participants?.length ?? 0;
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
      handleTyping(true);
      typingTimeoutRef.current = setTimeout(() => handleTyping(false), SELF_TYPING_IDLE_MS);
    } else handleTyping(false);
  };

  // Send message handler
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !connected) return;

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
      />
      <RoomInfoDialog roomId={roomId} isOpen={showInfo} onClose={() => setShowInfo(false)} />

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
          canResend={connected}
          hasMore={hasMoreMessages}
          loadingOlder={loadingOlder}
          olderError={olderError}
          onLoadOlder={loadOlder}
        />
      </div>

      <TypingIndicator
        typingUserNames={typingUserNames}
        typingUsersCount={typingUsersList.length}
      />

      <MessageInput
        value={newMessage}
        onChange={handleInputChange}
        onSubmit={handleSendMessage}
        disabled={!newMessage.trim() || !connected}
        inputRef={inputRef}
        pausedHint={
          !connected && !loading
            ? "Reconnecting. Keep typing; sending resumes when the connection is back."
            : null
        }
      />
    </div>
  );
};

export default ChatInterface;
