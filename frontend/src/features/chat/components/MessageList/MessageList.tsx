import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../chat.types";
import { MessageBubble } from "../MessageBubble";

type MessageListProps = {
  messages: ChatMessage[];
  isSending: boolean;
};

/**
 * Scroll container with auto-scroll to the newest message. Scrolling only when
 * the user is already near the bottom, so reading back through history is not
 * yanked away by an incoming reply.
 */
export const MessageList = ({ messages, isSending }: MessageListProps) => {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom < 120) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, isSending]);

  return (
    <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
      {messages.length === 0 && (
        <p className="pt-8 text-center text-sm text-slate-500">
          Ask for a booking in your own words. I will confirm the details before anything is booked.
        </p>
      )}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {isSending && (
        <p className="text-sm text-slate-500" role="status">
          Thinking...
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
};
