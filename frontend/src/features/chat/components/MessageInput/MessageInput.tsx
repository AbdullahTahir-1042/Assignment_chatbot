import { useState } from "react";
import { SendButton } from "../SendButton";

type MessageInputProps = {
  onSend: (text: string) => void;
  isSending: boolean;
  disabled?: boolean;
};

export const MessageInput = ({ onSend, isSending, disabled = false }: MessageInputProps) => {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-slate-200 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor="chat-message">
        Message
      </label>
      <textarea
        id="chat-message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter is a newline. The usual chat convention,
          // and it means the confirmation buttons below are not the only path.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="Type a message"
        disabled={disabled || isSending}
        className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50"
      />
      <SendButton onClick={submit} isLoading={isSending} disabled={disabled || !text.trim()} />
    </form>
  );
};
