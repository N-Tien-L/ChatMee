"use client";

import { Message } from "@/lib/types";
import React, { useEffect } from "react";
import { AlertCircle, MessageSquare, RotateCw } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";

interface MessageListProps {
  messages: Message[];
  onlineUsers: Set<string>;
  formatDate: (d: Date) => string;
  formatTime: (d: Date) => string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  loading?: boolean;
  error?: string | null;
  onRetryLoad?: () => void;
  onResend?: (tempId: string) => void;
  onDiscard?: (tempId: string) => void;
  canResend?: boolean;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  onlineUsers,
  formatDate,
  formatTime,
  messagesEndRef,
  loading = false,
  error = null,
  onRetryLoad,
  onResend,
  onDiscard,
  canResend = true,
}) => {
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messagesEndRef]);

  if (loading && messages.length === 0) {
    return (
      <div
        className="p-3 sm:p-4 space-y-4"
        role="status"
        aria-busy="true"
        aria-label="Loading messages"
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}
          >
            <Skeleton className="h-12 w-2/3 sm:w-64 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center gap-3 p-6 h-full"
        role="alert"
      >
        <AlertCircle className="w-10 h-10 text-red-400" aria-hidden="true" />
        <div>
          <p className="font-medium text-gray-900">Could not load messages</p>
          <p className="text-sm text-gray-500 break-words">{error}</p>
        </div>
        {onRetryLoad && (
          <Button variant="outline" size="sm" onClick={onRetryLoad}>
            <RotateCw className="w-4 h-4 mr-2" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      {error && (
        // History failed but live or own messages are on screen: the conversation is incomplete.
        <div
          className="mx-3 sm:mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0 break-words text-red-700">
            Could not load earlier messages: {error}
          </p>
          {onRetryLoad && (
            <Button variant="outline" size="sm" onClick={onRetryLoad}>
              <RotateCw className="w-4 h-4 mr-2" aria-hidden="true" />
              Retry
            </Button>
          )}
        </div>
      )}
      <div
        className="p-3 sm:p-4 space-y-3 sm:space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12 text-gray-500">
            <MessageSquare
              className="w-10 h-10 mb-3 text-gray-300"
              aria-hidden="true"
            />
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        )}

        {messages.map((message, index) => {
          const messageDate = new Date(message.createdAt);
          const showDate =
            index === 0 ||
            formatDate(messageDate) !==
              formatDate(new Date(messages[index - 1].createdAt));
          const online = onlineUsers.has(message.senderId);
          const failed = message.isOwn && message.status === "failed";

          return (
            <div key={`${message.id}-${index}`}>
              {showDate && (
                <div className="flex justify-center my-3 sm:my-4">
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
                  className={`min-w-0 max-w-[85%] sm:max-w-sm md:max-w-md lg:max-w-lg ${
                    message.isOwn ? "order-2" : "order-1"
                  }`}
                >
                  {!message.isOwn && (
                    <div className="flex items-center space-x-1 mb-1 px-3">
                      <p className="text-xs text-gray-500 truncate">
                        {message.senderName}
                      </p>
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          online ? "bg-green-500" : "bg-gray-400"
                        }`}
                        role="img"
                        aria-label={online ? "Online" : "Offline"}
                        title={online ? "Online" : "Offline"}
                      />
                    </div>
                  )}
                  <div
                    className={`px-3 sm:px-4 py-2 rounded-2xl break-words ${
                      message.isOwn
                        ? failed
                          ? "bg-blue-500/70 text-white"
                          : "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                    <div
                      className={`flex items-center justify-between mt-1 ${
                        message.isOwn ? "text-blue-100" : "text-gray-500"
                      }`}
                    >
                      <p className="text-xs">
                        <time dateTime={message.createdAt}>
                          {formatTime(messageDate)}
                        </time>
                      </p>
                      {message.isOwn && (
                        <div className="text-xs ml-2">
                          {message.status === "sending" && (
                            <span className="opacity-70" role="img" aria-label="Sending">⏳</span>
                          )}
                          {message.status === "sent" && (
                            <span className="opacity-70" role="img" aria-label="Sent">✓</span>
                          )}
                          {message.status === "failed" && (
                            <span className="text-red-300" role="img" aria-label="Failed to send" title={message.errorMessage || "Failed to send"}>✗</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {failed && message.tempId && (
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 px-1 text-xs">
                      <span className="text-red-600 break-words">
                        {message.errorMessage || "Failed to send"}
                      </span>
                      {onResend && (
                        <button
                          type="button"
                          onClick={() => onResend(message.tempId as string)}
                          disabled={!canResend}
                          className="rounded font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                        >
                          Resend
                        </button>
                      )}
                      {onDiscard && (
                        <button
                          type="button"
                          onClick={() => onDiscard(message.tempId as string)}
                          className="rounded font-medium text-gray-600 hover:underline"
                        >
                          Discard
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>
    </>
  );
};

export default MessageList;
