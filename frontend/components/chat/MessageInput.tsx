import React from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Send } from "lucide-react";

interface MessageInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  sending: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled,
  sending,
  inputRef,
}) => {
  return (
    <div className="p-4 border-t bg-white">
      <form onSubmit={onSubmit} className="flex items-center space-x-2">
        <div className="flex-1 relative">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Type a message..."
            value={value}
            onChange={onChange}
            className="pr-12 rounded-full border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Button
          type="submit"
          disabled={disabled}
          className="rounded-full p-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </Button>
      </form>
    </div>
  );
};

export default MessageInput;
