import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * Generic button. Knows nothing about bookings, auth or chat -- if a variant
 * ever needs to, it belongs in a feature component composing this.
 */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  isLoading?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-gradient-to-b from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 " +
    "hover:from-indigo-500 hover:to-violet-500 active:from-indigo-700 active:to-violet-700 " +
    "disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none",
  secondary: "border border-slate-300 bg-white text-slate-900 shadow-xs hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-indigo-50/70",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

export const Button = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) => (
  <button
    // Disabled while loading as well as on the prop, so a double-click cannot
    // fire two identical mutations.
    disabled={disabled || isLoading}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[color,background-color,border-color,box-shadow,opacity] duration-150",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
      "disabled:cursor-not-allowed disabled:opacity-60",
      VARIANTS[variant],
      SIZES[size],
      className,
    )}
    {...rest}
  >
    {isLoading && (
      <span
        aria-hidden
        className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
    )}
    {children}
  </button>
);
