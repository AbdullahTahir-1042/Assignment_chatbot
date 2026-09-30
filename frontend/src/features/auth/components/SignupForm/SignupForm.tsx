import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../../../ui/Button";
import { FormField } from "../../../../ui/FormField";
import { PasswordInput } from "../../../../ui/PasswordInput";
import { ErrorMessage } from "../../../../ui/ErrorMessage";
import { toMessage } from "../../../../lib/http";
import { generatePassword } from "../../../../lib/password";
import { useSignup } from "../../hooks/useSignup";
import { signupSchema, type SignupInput } from "../../auth.schema";

export const SignupForm = () => {
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    // Validate a field once the user leaves it, then re-check on every change.
    // That makes the email format and the password match correct themselves as
    // they are typed instead of waiting for the submit button.
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });
  const confirmPassword = useWatch({ control, name: "confirmPassword" });
  const liveMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const suggestPassword = () => {
    const candidate = generatePassword();
    // Fill both fields so the match rule passes; ask for validation so any
    // stale error clears and the fresh value is checked against the schema.
    setValue("password", candidate, { shouldValidate: true, shouldDirty: true });
    setValue("confirmPassword", candidate, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit((values) => signup.mutate(values))}>
      <FormField
        label="Name"
        autoComplete="name"
        placeholder="Jane Smith"
        error={errors.name?.message}
        {...register("name")}
      />
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@business.com"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        label="Password"
        error={errors.password?.message}
        hint="At least 8 characters with a lowercase letter, an uppercase letter and a special character."
      >
        {(field) => <PasswordInput autoComplete="new-password" {...field} {...register("password")} />}
      </FormField>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={suggestPassword}
        className="gap-1.5 px-1 -mt-1"
      >
        <WandIcon />
        Suggest a password
      </Button>
      <FormField
        label="Confirm password"
        error={errors.confirmPassword?.message ?? (liveMismatch ? "Passwords do not match" : undefined)}
      >
        {(field) => <PasswordInput autoComplete="new-password" {...field} {...register("confirmPassword")} />}
      </FormField>

      {signup.isError && <ErrorMessage message={toMessage(signup.error)} />}

      <Button type="submit" isLoading={signup.isPending} disabled={signup.isPending} className="w-full">
        {signup.isPending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
};

const WandIcon = () => (
  <svg
    aria-hidden
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
    />
  </svg>
);