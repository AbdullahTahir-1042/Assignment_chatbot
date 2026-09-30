import { cn } from "../../lib/cn";

type SpinnerProps = {
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  ringClassName?: string;
};

const SIZES = { sm: "size-4", md: "size-7", lg: "size-12" } as const;

export const Spinner = ({
  className,
  label = "Loading",
  size = "sm",
  ringClassName,
}: SpinnerProps) => (
  <span role="status" aria-label={label} className={cn("inline-flex", className)}>
    <span
      aria-hidden
      className={cn(
        "animate-spin rounded-full border-2",
        size === "lg" ? "border-[3px]" : "border-2",
        SIZES[size],
        ringClassName ?? "border-slate-300 border-t-slate-700",
      )}
    />
  </span>
);