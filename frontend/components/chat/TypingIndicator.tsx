import React from "react";

interface TypingIndicatorProps {
  typingUserNames: String[];
  typingUsersCount: number;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  typingUserNames,
  typingUsersCount,
}) => {
  if (typingUsersCount === 0) return null;

  let typingText =
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
    <div className="flex justify-start px-3 sm:px-4 pb-2 flex-shrink-0">
      <div className="max-w-[85%] sm:max-w-sm md:max-w-md lg:max-w-lg">
        <p className="text-xs text-gray-500 mb-1 px-3 truncate">{typingText}</p>
        <div className="px-3 sm:px-4 py-2 rounded-2xl bg-gray-100">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
            <div
              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.1s" }}
            ></div>
            <div
              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
