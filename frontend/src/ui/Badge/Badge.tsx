import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * A neutral pill. It does not know what a status is -- the mapping from a
 * booking status to a colour belongs in the appointments feature's StatusBadge,
 * which composes this.
 */
export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "positive" | "warning" | "danger";
};

const TONES: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-slate-100 text-slate-700",
  positive: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
};

export const Badge = ({ tone = "neutral", className, ...rest }: BadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      TONES[tone],
      className,
    )}
    {...rest}
  />
);
