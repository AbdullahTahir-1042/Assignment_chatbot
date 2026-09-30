import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Card = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5",
      className,
    )}
    {...rest}
  />
);
