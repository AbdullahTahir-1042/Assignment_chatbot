import { cn } from "../../../../lib/cn";

export const TypingIndicator = ({ show }: { show: boolean }) => {
  if (!show) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1 py-2")} role="status" aria-label="Assistant is replying">
      <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
      <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
    </span>
  );
};
