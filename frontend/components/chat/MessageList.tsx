"use client";

import { Message } from "@/lib/types";
import React, { useEffect } from "react";

interface MessageListProps {
  messages: Message[];
  onlineUsers: Set<string>;
  formatDate: (d: Date) => string;
  formatTime: (d: Date) => string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  onlineUsers,
  formatDate,
  formatTime,
  messagesEndRef,
}) => {
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => {
        const messageDate = new Date(message.createdAt);
        const showDate =
          index === 0 ||
          formatDate(messageDate) !==
            formatDate(new Date(messages[index - 1].createdAt));

        return (
          <div key={`${message.id}-${index}`}>
            {showDate && (
              <div className="flex justify-center my-4">
                <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                  {formatDate(messageDate)}
                </span>
              </div>
            )}

            <div
              className={`flex ${
                message.isOwn ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md ${
                  message.isOwn ? "order-2" : "order-1"
                }`}
              >
                {!message.isOwn && (
                  <div className="flex items-center space-x-1 mb-1 px-3">
                    <p className="text-xs text-gray-500">
                      {message.senderName}
                    </p>
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        onlineUsers.has(message.senderId)
                          ? "bg-green-500"
                          : "bg-gray-400"
                      }`}
                      title={
                        onlineUsers.has(message.senderId) ? "Online" : "Offline"
                      }
                    />
                  </div>
                )}
                <div
                  className={`px-4 py-2 rounded-2xl ${
                    message.isOwn
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <div
                    className={`flex items-center justify-between mt-1 ${
                      message.isOwn ? "text-blue-100" : "text-gray-500"
                    }`}
                  >
                    <p className="text-xs">{formatTime(messageDate)}</p>
                    {message.isOwn && (
                      <div className="text-xs ml-2">
                        {(message as Message).status === "sending" && (
                          <span className="opacity-70">⏳</span>
                        )}
                        {(message as Message).status === "sent" && (
                          <span className="opacity-70">✓</span>
                        )}
                        {(message as Message).status === "failed" && (
                          <span className="text-red-300">✗</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
