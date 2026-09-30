import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  size?: "narrow" | "default";
};

const WIDTHS = { narrow: "max-w-md", default: "max-w-3xl" } as const;

export const PageContainer = ({ size = "default", className, ...rest }: PageContainerProps) => (
  <div className={cn("mx-auto w-full px-4 py-8", WIDTHS[size], className)} {...rest} />
);
