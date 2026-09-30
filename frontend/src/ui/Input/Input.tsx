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
        "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900",
        "placeholder:text-slate-400 focus:border-slate-500 focus:outline-none",
        "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500",
        className,
      )}
      {...rest}
    />
  );
});
