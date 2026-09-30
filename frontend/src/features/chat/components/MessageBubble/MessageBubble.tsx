import { cn } from "../../../../lib/cn";
import type { ChatMessage } from "../../chat.types";

type MessageBubbleProps = {
  message: ChatMessage;
};

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/25"
            : "border border-slate-200 bg-white text-slate-900 shadow-sm shadow-slate-900/5",
        )}
      >
        {message.content}
      </div>
    </div>
  );
};
