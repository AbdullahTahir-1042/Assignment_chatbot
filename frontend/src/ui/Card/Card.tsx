import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Card = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-lg border border-slate-200 bg-white", className)} {...rest} />
);
