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
  /** Shown above the field while sending is paused, for example during a reconnect (G3). */
  pausedHint?: string | null;
}

const MESSAGE_INPUT_ID = "chat-message-input";

const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled,
  inputRef,
  pausedHint = null,
}) => {
  // Enter sends, Shift+Enter inserts a newline; Enter while an IME is composing is left alone.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!disabled) e.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="flex-shrink-0 px-3 pb-3 sm:px-7 sm:pb-5">
      <p role="status" aria-live="polite" className="empty:hidden mb-1.5 text-xs text-warning">
        {pausedHint}
      </p>
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 rounded-[10px] border border-border bg-card p-2 pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25"
      >
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
            className="block w-full resize-none field-sizing-content min-h-9 max-h-32 overflow-y-auto bg-transparent py-1.5 text-sm sm:text-base outline-none placeholder:text-muted-foreground focus-visible:outline-none"
          />
          <span id={`${MESSAGE_INPUT_ID}-hint`} className="sr-only">
            Press Enter to send, Shift+Enter for a new line.
          </span>
          {value.length >= COUNTER_THRESHOLD && (
            <p className="absolute right-0 -top-7 font-mono text-xs tabular text-muted-foreground" aria-live="polite">
              {`${value.length}/${MESSAGE_MAX_LENGTH}`}
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={disabled}
          aria-label="Send message"
          className="h-9 flex-shrink-0 gap-1.5 rounded-md px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
        >
          <Send size={16} aria-hidden="true" />
          <span className="hidden sm:inline" aria-hidden="true">Send</span>
        </Button>
      </form>
    </div>
  );
};

export default MessageInput;
