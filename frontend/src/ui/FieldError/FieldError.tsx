import { cn } from "../../lib/cn";

/**
 * A one-line validation message, wired to its input via aria-describedby by the
 * parent FormField. Renders nothing when there is no message, so callers do not
 * have to conditionally mount it.
 */
type FieldErrorProps = {
  id?: string;
  message?: string | undefined;
};

export const FieldError = ({ id, message }: FieldErrorProps) => {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn("mt-1 text-sm text-red-600")}>
      {message}
    </p>
  );
};
