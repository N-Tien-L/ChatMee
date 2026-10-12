import React from "react";
import { Button } from "../ui/button";
import { Send } from "lucide-react";

/** Server limit after trim (AC-004-3): 1-5000 characters. */
export const MESSAGE_MAX_LENGTH = 5000;
/** The counter appears once the draft is within 10% of the limit (U-5). */
const COUNTER_THRESHOLD = 4500;

interface MessageInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

const MESSAGE_INPUT_ID = "chat-message-input";

const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled,
  inputRef,
}) => {
  // Enter sends, Shift+Enter inserts a newline; Enter while an IME is composing is left alone.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!disabled) e.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="p-3 sm:p-4 border-t bg-white flex-shrink-0">
      <form onSubmit={onSubmit} className="flex items-end space-x-2">
        <div className="flex-1 relative min-w-0">
          <label htmlFor={MESSAGE_INPUT_ID} className="sr-only">
            Message
          </label>
          <textarea
            id={MESSAGE_INPUT_ID}
            ref={inputRef}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder="Type a message..."
            value={value}
            onChange={onChange}
            onKeyDown={handleKeyDown}
            aria-describedby={`${MESSAGE_INPUT_ID}-hint`}
            className="block w-full resize-none field-sizing-content min-h-10 max-h-32 overflow-y-auto rounded-2xl border border-gray-300 bg-transparent px-4 py-2 text-sm sm:text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-blue-500 focus-visible:ring-[3px] focus-visible:ring-blue-500/40"
          />
          <span id={`${MESSAGE_INPUT_ID}-hint`} className="sr-only">
            Press Enter to send, Shift+Enter for a new line.
          </span>
          {value.length >= COUNTER_THRESHOLD && (
            <p className="absolute right-3 -top-5 text-xs text-gray-500" aria-live="polite">
              {`${value.length}/${MESSAGE_MAX_LENGTH}`}
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={disabled}
          aria-label="Send message"
          className="rounded-full p-2.5 sm:p-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send size={18} className="sm:w-5 sm:h-5" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
};

export default MessageInput;
