"use client";

import { Message, MessageType } from "@/lib/types";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Check, Clock, MessageSquare, RotateCw } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";
import { UserAvatar } from "../common/UserAvatar";

/** Distance from the top of the list at which the next older page is requested. */
const LOAD_OLDER_THRESHOLD_PX = 48;
/** Within this distance of the bottom the reader counts as following the conversation. */
const NEAR_BOTTOM_PX = 80;
/** Consecutive messages from one sender inside this window share one avatar and name. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface MessageListProps {
  messages: Message[];
  onlineUsers: Set<string>;
  /** False until the first presence snapshot: the dots stay neutral instead of "offline" (SPEC-005 AC-005-6). */
  presenceKnown?: boolean;
  formatDate: (d: Date) => string;
  formatTime: (d: Date) => string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  loading?: boolean;
  error?: string | null;
  onRetryLoad?: () => void;
  onResend?: (tempId: string) => void;
  onDiscard?: (tempId: string) => void;
  canResend?: boolean;
  /** Older history exists before the first message (CM-044). */
  hasMore?: boolean;
  loadingOlder?: boolean;
  olderError?: string | null;
  /** Requests the next older page; called when scrolled to the top and by Retry. */
  onLoadOlder?: () => void;
}

const isNearBottom = (el: HTMLElement) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;

/** True when the row starts a new group: a date change, a system row, another sender or a long pause. */
const startsGroup = (messages: Message[], index: number, showDate: boolean) => {
  if (index === 0 || showDate) return true;
  const previous = messages[index - 1];
  const current = messages[index];
  if (previous.type === MessageType.SYSTEM || current.type === MessageType.SYSTEM) return true;
  if (previous.senderId !== current.senderId) return true;
  return Date.parse(current.createdAt) - Date.parse(previous.createdAt) > GROUP_WINDOW_MS;
};

const MessageList: React.FC<MessageListProps> = (props) => {
  const { messages, messagesEndRef, hasMore = false, loadingOlder = false, olderError = null, onLoadOlder, loading = false, error = null } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const edgesRef = useRef<{ first?: string; last?: string; scrollHeight: number }>({ scrollHeight: 0 });
  // Read at the moment a message arrives, before the list grows, so content growth alone never counts as scrolling away.
  const atBottomRef = useRef(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const [needsLoadOlder, setNeedsLoadOlder] = useState(false);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      atBottomRef.current = true;
      setUnseenCount(0);
      messagesEndRef.current?.scrollIntoView({ behavior });
    },
    [messagesEndRef]
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const previous = edgesRef.current;
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    if (el && previous.last !== undefined && last === previous.last && first !== previous.first) {
      // An older page was prepended: keep the message the user was reading where it was.
      el.scrollTop += el.scrollHeight - previous.scrollHeight;
    } else if (last !== previous.last) {
      if (previous.last === undefined) {
        // A first load jumps straight to the bottom, so its scroll never passes the load-older threshold.
        scrollToBottom("auto");
      } else if (messages[messages.length - 1]?.isOwn || atBottomRef.current) {
        scrollToBottom("smooth");
      } else {
        const index = messages.findIndex((m) => m.id === previous.last);
        const added = index === -1 ? 1 : messages.length - index - 1;
        setUnseenCount((count) => count + added);
      }
    }
    edgesRef.current = { first, last, scrollHeight: el?.scrollHeight ?? 0 };
  }, [messages, scrollToBottom]);

  // When the loaded page does not fill the viewport there is nothing to scroll, so offer the button.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    setNeedsLoadOlder(!!el && hasMore && el.scrollHeight <= el.clientHeight);
  }, [messages, hasMore, loading, error]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = isNearBottom(el);
    if (atBottomRef.current) setUnseenCount(0);
    if (!onLoadOlder || !hasMore || loadingOlder || olderError) return;
    if (el.scrollTop <= LOAD_OLDER_THRESHOLD_PX) onLoadOlder();
  };

  return (
    <div className="relative h-full">
      {/* Scroll anchoring is off because the prepend adjustment above already keeps the position. */}
      <div
        ref={scrollRef}
        data-testid="message-scroll"
        onScroll={handleScroll}
        className="h-full overflow-y-auto [overflow-anchor:none]"
      >
        <MessageListContent
          {...props}
          showLoadOlder={needsLoadOlder && !loadingOlder && !olderError && !loading && !error}
        />
      </div>
      {unseenCount > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            className="pointer-events-auto rounded-full shadow-md"
            onClick={() => scrollToBottom("smooth")}
          >
            <ArrowDown className="w-4 h-4 mr-1" aria-hidden="true" />
            New messages
          </Button>
        </div>
      )}
    </div>
  );
};

interface MessageListContentProps extends MessageListProps {
  showLoadOlder: boolean;
}

const MessageListContent: React.FC<MessageListContentProps> = ({
  messages,
  onlineUsers,
  presenceKnown = true,
  formatDate,
  formatTime,
  messagesEndRef,
  loading = false,
  error = null,
  onRetryLoad,
  onResend,
  onDiscard,
  canResend = true,
  hasMore = false,
  loadingOlder = false,
  olderError = null,
  onLoadOlder,
  showLoadOlder,
}) => {
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
      {loadingOlder && (
        <div
          className="flex items-center justify-center gap-2 pt-3 text-xs text-gray-500"
          role="status"
          aria-live="polite"
        >
          <RotateCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          Loading older messages…
        </div>
      )}
      {olderError && (
        <div
          className="mx-3 sm:mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0 break-words text-red-700">
            Could not load older messages: {olderError}
          </p>
          {onLoadOlder && (
            <Button variant="outline" size="sm" onClick={onLoadOlder}>
              <RotateCw className="w-4 h-4 mr-2" aria-hidden="true" />
              Retry
            </Button>
          )}
        </div>
      )}
      {showLoadOlder && onLoadOlder && (
        <div className="flex justify-center pt-3">
          <Button variant="outline" size="sm" onClick={onLoadOlder}>
            Load older messages
          </Button>
        </div>
      )}
      {onLoadOlder && !hasMore && !loading && !error && messages.length > 0 && (
        <p className="pt-3 text-center text-xs text-gray-400">Beginning of conversation</p>
      )}
      <div
        className="p-3 sm:p-4 space-y-1"
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
          const groupStart = startsGroup(messages, index, showDate);
          const online = onlineUsers.has(message.senderId);
          const failed = message.isOwn && message.status === "failed";

          return (
            <div key={message.id}>
              {showDate && (
                <div className="flex justify-center my-3 sm:my-4">
                  <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {formatDate(messageDate)}
                  </span>
                </div>
              )}

              {message.type === MessageType.SYSTEM ? (
                <div data-message-type={message.type} className="flex justify-center py-1">
                  <p className="text-center text-xs text-gray-500 break-words max-w-[90%]">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div
                  data-message-type={message.type}
                  className={`flex items-end gap-2 ${
                    message.isOwn ? "justify-end" : "justify-start"
                  } ${groupStart ? "mt-3 sm:mt-4" : "mt-0.5"}`}
                >
                  {!message.isOwn && (
                    <div className="w-8 flex-shrink-0">
                      {groupStart && (
                        <UserAvatar name={message.senderName} size="sm" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 max-w-[85%] sm:max-w-sm md:max-w-md lg:max-w-lg">
                    {!message.isOwn && groupStart && (
                      <div className="flex items-center space-x-1 mb-1 px-3">
                        <p className="text-xs text-gray-500 truncate">
                          {message.senderName}
                        </p>
                        <div
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            !presenceKnown
                              ? "bg-gray-300"
                              : online
                              ? "bg-green-500"
                              : "bg-gray-400"
                          }`}
                          role="img"
                          aria-label={!presenceKnown ? "Status unknown" : online ? "Online" : "Offline"}
                          title={!presenceKnown ? "Status unknown" : online ? "Online" : "Offline"}
                        />
                      </div>
                    )}
                    <div
                      className={`px-3 sm:px-4 py-2 rounded-2xl break-words ${
                        message.isOwn
                          ? failed
                            ? "border border-destructive bg-background text-foreground"
                            : "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                      <div
                        className={`flex items-center justify-between mt-1 ${
                          message.isOwn && !failed ? "text-blue-100" : "text-gray-500"
                        }`}
                      >
                        <p className="text-xs">
                          <time dateTime={message.createdAt}>
                            {formatTime(messageDate)}
                          </time>
                        </p>
                        {message.isOwn && (
                          <div className="ml-2">
                            {message.status === "sending" && (
                              <span role="img" aria-label="Sending" className="opacity-70">
                                <Clock className="w-3 h-3" aria-hidden="true" />
                              </span>
                            )}
                            {message.status === "sent" && (
                              <span role="img" aria-label="Sent" className="opacity-70">
                                <Check className="w-3 h-3" aria-hidden="true" />
                              </span>
                            )}
                            {message.status === "failed" && (
                              <span
                                role="img"
                                aria-label="Failed to send"
                                title={message.errorMessage || "Failed to send"}
                                className="text-destructive"
                              >
                                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                              </span>
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
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>
    </>
  );
};

export default MessageList;
