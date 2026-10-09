"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useShallow } from "zustand/react/shallow";
import { useRoomMessages } from "@/hooks/useRoomMessage";
import { useChatStore } from "@/lib/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useUsersStore } from "@/lib/stores/usersStore";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import TypingIndicator from "./TypingIndicator";
import MessageInput from "./MessageInput";

interface ChatInterfaceProps {
  roomId: string;
  onToggleSidebar?: () => void;
}

// Room hooks live in ChatRoomView, so leaving or deleting a room (which removes it from the
// store) unmounts them and releases the room's STOMP subscriptions.
const ChatInterface: React.FC<ChatInterfaceProps> = ({
  roomId,
  onToggleSidebar,
}) => {
  const roomExists = useChatRoomsStore((state) =>
    state.rooms.some((room) => room.id === roomId)
  );

  if (!roomExists)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">Room not found</div>
      </div>
    );

  return <ChatRoomView roomId={roomId} onToggleSidebar={onToggleSidebar} />;
};

const ChatRoomView: React.FC<ChatInterfaceProps> = ({
  roomId,
  onToggleSidebar,
}) => {
  const deleteRoom = useChatRoomsStore((state) => state.deleteRoom);
  const handleRoomDeleted = useCallback(
    () => deleteRoom(roomId),
    [deleteRoom, roomId]
  );
  const { messages, connected, sendMessage, loading, sending } =
    useRoomMessages(roomId, { onRoomDeleted: handleRoomDeleted });
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get rooms
  const { rooms } = useChatRoomsStore(
    useShallow((state) => ({
      rooms: state.rooms,
    }))
  );

  // Get user cache for names
  const { getUserFromCache } = useUsersStore();

  // Typing helpers over the app's single STOMP session
  const { sendTyping, subscribeTyping, connected: wsConnected } = useWebSocket();

  // Get chat store state
  const { onlineUsers, typingUsers } = useChatStore(
    useShallow((state) => ({
      onlineUsers: state.onlineUsers,
      typingUsers: state.typingUsers,
    }))
  );

  // Subscribe to typing events for current room
  useEffect(() => {
    if (!roomId) return;
    return subscribeTyping(roomId);
  }, [roomId, subscribeTyping]);

  const currentRoom = rooms.find((room) => room.id === roomId);

  // Get typing users, user names for current room
  const typingUsersList = Array.from(typingUsers[roomId] || new Set());
  const typingUserNames = typingUsersList
    .map((userId) => getUserFromCache(userId)?.name || "Someone")
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
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (value.trim()) {
      handleTyping(true);
      typingTimeoutRef.current = setTimeout(() => handleTyping(false), 2000);
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
        <div className="text-center text-gray-500">Room not found</div>
      </div>
    );

  const onlineCount =
    currentRoom.participants?.filter((id) => onlineUsers.has(id)).length || 0;

  return (
    <div className="flex flex-col h-full w-full bg-white overflow-hidden">
      <ChatHeader
        room={currentRoom}
        loading={loading}
        onlineCount={onlineCount}
        onToggleSidebar={onToggleSidebar}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <MessageList
          messages={messages}
          onlineUsers={onlineUsers}
          formatDate={formatDate}
          formatTime={formatTime}
          messagesEndRef={messagesEndRef}
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
        sending={sending}
        inputRef={inputRef}
      />
    </div>
  );
};

export default ChatInterface;
