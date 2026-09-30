import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900",
        "placeholder:text-slate-400 shadow-xs transition-[border-color,box-shadow] duration-150",
        "hover:border-slate-400",
        "focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10",
        "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500/10",
        className,
      )}
      {...rest}
    />
  );
});
