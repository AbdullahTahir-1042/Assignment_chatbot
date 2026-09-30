import { useEffect, useRef, useState } from "react";
import { SendButton } from "../SendButton";

// The input starts at the send button's height and grows with its content,
// stopping at this many pixels — after which it scrolls instead of stretching.
const MAX_INPUT_HEIGHT = 120;

type MessageInputProps = {
  onSend: (text: string) => void;
  isSending: boolean;
  disabled?: boolean;
};

export const MessageInput = ({ onSend, isSending, disabled = false }: MessageInputProps) => {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending || disabled) return;
    onSend(trimmed);
    setText("");
  };

  // Match WhatsApp's grow-then-scroll: size to the content each time it changes,
  // clamped to the cap, so the box never outgrows its allotted space.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [text]);

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
        ref={textareaRef}
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
        rows={1}
        placeholder="Type a message"
        disabled={disabled || isSending}
        className="max-h-[120px] min-h-8 flex-1 resize-none overflow-y-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: "2rem" }}
      />
      <SendButton onClick={submit} isLoading={isSending} disabled={disabled || !text.trim()} />
    </form>
  );
};