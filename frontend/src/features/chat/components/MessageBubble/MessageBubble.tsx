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
          "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-900",
        )}
      >
        {message.content}
      </div>
    </div>
  );
};
