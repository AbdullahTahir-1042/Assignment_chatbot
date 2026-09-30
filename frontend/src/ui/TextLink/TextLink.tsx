import type { AnchorHTMLAttributes } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/cn";

type TextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
};

/** A router link that looks like one. Uses react-router, so no full reload. */
export const TextLink = ({ to, className, children, ...rest }: TextLinkProps) => (
  <Link to={to} className={cn("text-sm text-slate-600 underline hover:text-slate-900", className)} {...rest}>
    {children}
  </Link>
);
