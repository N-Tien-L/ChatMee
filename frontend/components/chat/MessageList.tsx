"use client";

import { Message, MessageType } from "@/lib/types";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, MessageSquare, RotateCw } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";
import { UserAvatar } from "../common/UserAvatar";
import { isDeletedUser } from "../common/deletedUser";
import { DeliveryTab, useJustConfirmed } from "./DeliveryTab";
import { MessageActions } from "./MessageActions";

/** Distance from the top of the list at which the next older page is requested. */
const LOAD_OLDER_THRESHOLD_PX = 48;
/** Within this distance of the bottom the reader counts as following the conversation. */
const NEAR_BOTTOM_PX = 80;
/** Consecutive messages from one sender inside this window share one avatar and name. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** A pause this long inside one day gets its own time marker, as in Messenger. */
const TIME_BREAK_MS = 60 * 60 * 1000;

interface MessageListProps {
  recovering?: boolean;
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
  /** Direct message with this person: no sender names or avatars on their messages, and a person intro on top. */
  directWith?: { name: string; avatarUrl?: string | null } | null;
  /** Report another member's message (SPEC-009 AC-009-20); offered in the message actions menu. */
  onReport?: (message: Message) => void;
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

const findLastOwnIndex = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].isOwn) return i;
  return -1;
};

/** Wraps a bubble in its actions menu; pending and failed messages have nothing to act on yet. */
function BubbleActions({
  enabled,
  children,
  ...rest
}: { enabled: boolean } & React.ComponentProps<typeof MessageActions>) {
  if (!enabled) return <div className={rest.className}>{children}</div>;
  return <MessageActions {...rest}>{children}</MessageActions>;
}

/** Your own bubble: floats a little while sending, then settles with one ember ring when the server confirms. */
function OwnBubble({ status, className, children }: { status: Message["status"]; className: string; children: React.ReactNode }) {
  const confirmed = useJustConfirmed(status);
  const motionClass = status === "sending" ? "is-sending" : confirmed ? "animate-sent" : "";
  return <div className={`${className} ${motionClass}`}>{children}</div>;
}

const MessageList: React.FC<MessageListProps> = (props) => {
  const { messages, messagesEndRef, hasMore = false, loadingOlder = false, olderError = null, onLoadOlder, loading = false, error = null } = props;
  const visibleAnchor = useRef<{ id: string; offset: number } | null>(null);
  const rememberAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const row = Array.from(el.querySelectorAll<HTMLElement>("[data-message-id]"))
      .find(node => node.getBoundingClientRect().bottom > top);
    visibleAnchor.current = row ? { id: row.dataset.messageId!, offset: row.getBoundingClientRect().top - top } : null;
  }, []);
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
    const anchor = visibleAnchor.current;
    const row = el && anchor && Array.from(el.querySelectorAll<HTMLElement>("[data-message-id]"))
      .find(node => node.dataset.messageId === anchor.id);
    if (el && row && anchor && !atBottomRef.current &&
        !(messages[messages.length - 1]?.isOptimistic && messages[messages.length - 1]?.isOwn)) {
      el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset;
      if (last !== previous.last) setUnseenCount(count => count + 1);
    } else if (el && previous.last !== undefined && last === previous.last && first !== previous.first) {
      // An older page was prepended: keep the message the user was reading where it was.
      el.scrollTop += el.scrollHeight - previous.scrollHeight;
    } else if (last !== previous.last) {
      if (previous.last === undefined) {
        // A first load jumps straight to the bottom, so its scroll never passes the load-older threshold.
        scrollToBottom("auto");
      } else if ((messages[messages.length - 1]?.isOwn && !props.recovering) || atBottomRef.current) {
        scrollToBottom("smooth");
      } else {
        const index = messages.findIndex((m) => m.id === previous.last);
        const added = index === -1 ? 1 : messages.length - index - 1;
        setUnseenCount((count) => count + added);
      }
    }
    edgesRef.current = { first, last, scrollHeight: el?.scrollHeight ?? 0 };
    rememberAnchor();
  }, [messages, scrollToBottom, rememberAnchor, props.recovering]);

  // When the loaded page does not fill the viewport there is nothing to scroll, so offer the button.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    setNeedsLoadOlder(!!el && hasMore && el.scrollHeight <= el.clientHeight);
  }, [messages, hasMore, loading, error]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = isNearBottom(el);
    rememberAnchor();
    if (atBottomRef.current) setUnseenCount(0);
    if (!onLoadOlder || !hasMore || loadingOlder || olderError) return;
    if (el.scrollTop <= LOAD_OLDER_THRESHOLD_PX) onLoadOlder();
  };

  return (
    <div className="relative h-full">
      {/* Quiet dotted ground behind the conversation; plain CSS so it costs nothing at any size. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--primary)_14%,transparent)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />
      {/* Scroll anchoring is off because the prepend adjustment above already keeps the position. */}
      <div
        ref={scrollRef}
        data-testid="message-scroll"
        onScroll={handleScroll}
        className="relative h-full overflow-y-auto [overflow-anchor:none]"
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
  directWith = null,
  onReport,
  showLoadOlder,
}) => {
  if (loading && messages.length === 0) {
    return (
      <div
        className="px-3 py-4 sm:px-7 space-y-4"
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
        <AlertCircle className="w-10 h-10 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-medium text-foreground">Could not load messages</p>
          <p className="text-sm text-muted-foreground break-words">{error}</p>
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

  const lastOwnIndex = findLastOwnIndex(messages);

  return (
    <>
      {error && (
        // History failed but live or own messages are on screen: the conversation is incomplete.
        <div
          className="mx-3 sm:mx-7 mt-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-danger-surface px-3 py-2 text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0 break-words text-destructive">
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
          className="flex items-center justify-center gap-2 pt-3 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <RotateCw className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" />
          Loading older messages…
        </div>
      )}
      {olderError && (
        <div
          className="mx-3 sm:mx-7 mt-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-danger-surface px-3 py-2 text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0 break-words text-destructive">
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
        directWith ? (
          <div className="flex flex-col items-center gap-2 px-4 pt-8 pb-2 text-center">
            <UserAvatar name={directWith.name} avatarUrl={directWith.avatarUrl} size="xl" className="h-20 w-20 text-2xl shadow-[0_14px_30px_-14px_rgb(15_31_28/0.5)]" />
            <p className="mt-1 font-display text-lg font-semibold text-foreground">{directWith.name}</p>
            <p className="text-xs text-muted-foreground">
              Beginning of conversation · just the two of you
            </p>
          </div>
        ) : (
          <p className="pt-4 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Beginning of conversation
          </p>
        )
      )}
      <div
        className="px-3 py-4 sm:px-7"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mb-3 text-border" aria-hidden="true" />
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
          const showTimeBreak =
            !showDate &&
            Date.parse(message.createdAt) - Date.parse(messages[index - 1].createdAt) >= TIME_BREAK_MS;
          const showSentMark = message.status !== "sent" || index === lastOwnIndex;
          const online = onlineUsers.has(message.senderId);
          const failed = message.isOwn && message.status === "failed";
          const pending = message.isOwn && message.status === "sending";

          return (
            <div key={message.id} data-message-id={message.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="rounded-full bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground shadow-sm ring-1 ring-border">
                    {formatDate(messageDate)}
                  </span>
                </div>
              )}

              {showTimeBreak && (
                <div className="flex justify-center my-4">
                  <span className="rounded-full bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground shadow-sm ring-1 ring-border">
                    {formatTime(messageDate)}
                  </span>
                </div>
              )}

              {message.type === MessageType.SYSTEM ? (
                <div data-message-type={message.type} className="flex justify-center py-1.5">
                  <p className="text-center text-xs text-muted-foreground break-words max-w-[90%]">
                    {message.content}
                  </p>
                </div>
              ) : message.isOwn ? (
                <div
                  data-message-type={message.type}
                  className={`animate-message-in group flex flex-col items-end gap-1 ${groupStart ? "mt-4" : "mt-1"}`}
                >
                  <div className="flex max-w-full items-end justify-end gap-2">
                  {!showSentMark && (
                    <time
                      dateTime={message.createdAt}
                      className="pb-1 font-mono text-[11px] tabular text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      {formatTime(messageDate)}
                    </time>
                  )}
                  <BubbleActions
                    enabled={!failed && !pending}
                    message={message}
                    timeLabel={formatTime(messageDate)}
                    className="max-w-[85%] sm:max-w-md lg:max-w-xl"
                  >
                  <OwnBubble
                    status={message.status}
                    className={`rounded-2xl rounded-br-md px-3.5 py-2 break-words transition-[colors,transform,box-shadow] duration-300 ${
                      failed
                        ? "border-[1.5px] border-destructive bg-card text-foreground"
                        : pending
                          ? "border-[1.5px] border-dashed border-primary/70 bg-card/80 text-foreground"
                          : "bg-gradient-to-br from-bubble-own-from to-bubble-own-to text-primary-foreground shadow-[0_6px_18px_-10px_rgb(11_107_93/0.8)]"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  </OwnBubble>
                  </BubbleActions>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs">
                    {failed && message.tempId && (
                      <>
                        <span className="text-destructive break-words">
                          {message.errorMessage || "Failed to send"}
                        </span>
                        {onResend && (
                          <button
                            type="button"
                            onClick={() => onResend(message.tempId as string)}
                            disabled={!canResend}
                            className="rounded font-semibold text-destructive underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                          >
                            Resend
                          </button>
                        )}
                        {onDiscard && (
                          <button
                            type="button"
                            onClick={() => onDiscard(message.tempId as string)}
                            className="rounded font-medium text-muted-foreground hover:underline"
                          >
                            Discard
                          </button>
                        )}
                      </>
                    )}
                    {/* Like Messenger: only the latest sent message keeps its mark; older ones show a plain time on hover. */}
                    {showSentMark && <DeliveryTab message={message} formatTime={formatTime} />}
                  </div>
                </div>
              ) : (
                <div
                  data-message-type={message.type}
                  className={`animate-message-in group flex items-start gap-2.5 ${groupStart ? "mt-4" : "mt-1"}`}
                >
                  <div className={`w-8 flex-shrink-0 ${directWith ? "hidden" : ""}`}>
                    {groupStart && (
                      <UserAvatar
                        name={message.senderName}
                        size="sm"
                        variant={isDeletedUser(message.senderName) ? "neutral" : "default"}
                      />
                    )}
                  </div>
                  <div className="min-w-0 max-w-[85%] sm:max-w-md lg:max-w-xl">
                    {groupStart && !directWith && (
                      <div className="flex items-baseline gap-2 mb-1">
                        <p className="text-[13px] font-semibold text-foreground truncate">
                          {message.senderName}
                        </p>
                        <span
                          className={`h-1.5 w-1.5 flex-shrink-0 self-center rounded-full ${
                            !presenceKnown ? "bg-border" : online ? "bg-success" : "bg-muted-foreground/50"
                          }`}
                          role="img"
                          aria-label={!presenceKnown ? "Status unknown" : online ? "Online" : "Offline"}
                          title={!presenceKnown ? "Status unknown" : online ? "Online" : "Offline"}
                        />
                        <time
                          dateTime={message.createdAt}
                          className="font-mono text-[11px] tabular text-muted-foreground"
                        >
                          {formatTime(messageDate)}
                        </time>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <BubbleActions
                        enabled
                        message={message}
                        timeLabel={formatTime(messageDate)}
                        onReport={onReport}
                        className="min-w-0"
                      >
                        <div className={`rounded-2xl bg-card px-3.5 py-2 break-words text-card-foreground shadow-[0_2px_10px_-6px_rgb(15_31_28/0.25)] ring-1 ring-border ${groupStart ? "rounded-tl-md" : ""}`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                      </BubbleActions>
                      {(!groupStart || directWith) && (
                        <time
                          dateTime={message.createdAt}
                          className="pb-1 font-mono text-[11px] tabular text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          {formatTime(messageDate)}
                        </time>
                      )}
                    </div>
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
