import React from "react";
import { UserAvatar } from "../common/UserAvatar";

interface TypingIndicatorProps {
  typingUserNames: string[];
  typingUsersCount: number;
}

const MAX_FACES = 3;

/** Who is typing: their faces, a ghost bubble with a dot wave, and the names (D-16). */
const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  typingUserNames,
  typingUsersCount,
}) => {
  if (typingUsersCount === 0) return null;

  const typingText =
    typingUserNames.length === 1
      ? `${typingUserNames[0]} is typing...`
      : typingUserNames.length === 2
      ? `${typingUserNames[0]} and ${typingUserNames[1]} are typing...`
      : typingUserNames.length === 3
      ? `${typingUserNames[0]}, ${typingUserNames[1]} and ${typingUserNames[2]} are typing...`
      : typingUserNames.length > 3
      ? `${typingUserNames[0]}, ${typingUserNames[1]} and ${
          typingUsersCount - 2
        } others are typing...`
      : "Someone is typing...";

  return (
    <div className="animate-message-in flex flex-shrink-0 items-center gap-2.5 px-3 pb-2 sm:px-7">
      <span className="flex -space-x-2" aria-hidden="true">
        {typingUserNames.slice(0, MAX_FACES).map((name, index) => (
          <UserAvatar key={`${name}-${index}`} name={name} size="sm" className="ring-2 ring-background" />
        ))}
      </span>
      <span
        className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-card px-3 py-2.5 shadow-[0_4px_14px_-8px_rgb(0_0_0/0.4)] ring-1 ring-border"
        aria-hidden="true"
      >
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: `${dot * 140}ms` }} />
        ))}
      </span>
      <p className="truncate text-xs text-muted-foreground">{typingText}</p>
    </div>
  );
};

export default TypingIndicator;
