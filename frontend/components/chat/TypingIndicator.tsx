import React from "react";

interface TypingIndicatorProps {
  typingUserNames: string[];
  typingUsersCount: number;
}

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
    <div className="animate-message-in flex flex-shrink-0 items-center gap-2 px-3 pb-2 sm:px-7">
      <span className="flex gap-1 rounded-full bg-card px-2.5 py-2 shadow-sm ring-1 ring-border" aria-hidden="true">
        {[0, 0.15, 0.3].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </span>
      <p className="truncate text-xs text-muted-foreground">{typingText}</p>
    </div>
  );
};

export default TypingIndicator;
