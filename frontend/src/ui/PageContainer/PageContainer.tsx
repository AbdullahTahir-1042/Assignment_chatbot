import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  size?: "narrow" | "default" | "full";
  padding?: boolean;
};

const WIDTHS = { narrow: "max-w-md", default: "max-w-3xl", full: "max-w-none" } as const;

export const PageContainer = ({ size = "default", padding = true, className, ...rest }: PageContainerProps) => (
  <div className={cn("mx-auto w-full", padding && "px-4 py-8", WIDTHS[size], className)} {...rest} />
);
