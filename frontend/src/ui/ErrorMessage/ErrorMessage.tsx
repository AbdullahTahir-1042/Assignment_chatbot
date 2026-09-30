import { cn } from "../../lib/cn";

/**
 * The banner for a failed request. `role="alert"` so it is announced the moment
 * it appears, rather than being scrolled past.
 */
export const ErrorMessage = ({ message, className }: { message: string; className?: string }) => (
  <div
    role="alert"
    className={cn(
      "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800",
      className,
    )}
  >
    {message}
  </div>
);
