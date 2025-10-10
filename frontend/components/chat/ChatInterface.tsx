"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useShallow } from "zustand/react/shallow";
import { useRoomMessages } from "@/hooks/useRoomMessage";
import { useChatStore } from "@/lib/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuthStore } from "@/lib/stores";
import { useUsersStore } from "@/lib/stores/usersStore";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import TypingIndicator from "./TypingIndicator";
import MessageInput from "./MessageInput";

interface ChatInterfaceProps {
  roomId: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ roomId }) => {
  const { messages, connected, sendMessage, wsError, loading, sending } =
    useRoomMessages(roomId);
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

  // Get WebSocket functions for typing (use the same instance as useRoomMessages)
  const {
    sendTyping,
    subscribeTyping,
    connected: wsConnected,
  } = useWebSocket();

  // Get chat store state
  const { onlineUsers, typingUsers } = useChatStore(
    useShallow((state) => ({
      onlineUsers: state.onlineUsers,
      typingUsers: state.typingUsers,
    }))
  );

  // Subscribe to typing events for current room
  useEffect(() => {
    if (wsConnected && roomId) {
      subscribeTyping(roomId);
    }
  }, [wsConnected, roomId, subscribeTyping]);

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
    <div className="flex flex-col h-full bg-white">
      <ChatHeader
        room={currentRoom}
        connected={wsConnected}
        loading={loading}
        onlineCount={onlineCount}
      />

      <MessageList
        messages={messages}
        onlineUsers={onlineUsers}
        formatDate={formatDate}
        formatTime={formatTime}
        messagesEndRef={messagesEndRef}
      />

      <TypingIndicator
        typingUserNames={typingUserNames}
        typingUsersCount={typingUsersList.length}
      />

      <MessageInput
        value={newMessage}
        onChange={handleInputChange}
        onSubmit={handleSendMessage}
        disabled={!newMessage.trim() || !connected || sending}
        sending={sending}
        inputRef={inputRef}
      />
    </div>
  );
};

export default ChatInterface;
