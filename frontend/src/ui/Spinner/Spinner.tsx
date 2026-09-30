import { cn } from "../../lib/cn";

export const Spinner = ({ className, label = "Loading" }: { className?: string; label?: string }) => (
  <span role="status" aria-label={label} className={cn("inline-flex", className)}>
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
    />
  </span>
);
