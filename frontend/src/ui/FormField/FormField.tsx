import { useId } from "react";
import { Input } from "../Input";
import { Label } from "../Label";
import { FieldError } from "../FieldError";

type FormFieldProps = {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Rendered instead of the default Input, e.g. a textarea. */
  children?: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "children">;

/**
 * Label + control + error, with the ids generated so the label, the control and
 * the message are associated by the browser rather than by hand. Screen readers
 * announce the error because of that, not because of the styling.
 */
export const FormField = ({ label, error, hint, children, ...inputProps }: FormFieldProps) => {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">
        {children ? (
          children({ id, "aria-invalid": Boolean(error), ...(describedBy ? { "aria-describedby": describedBy } : {}) })
        ) : (
          <Input
            id={id}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            {...inputProps}
          />
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-slate-500">
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
};
