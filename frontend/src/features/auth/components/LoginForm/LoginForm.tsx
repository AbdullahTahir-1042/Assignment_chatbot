import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../../../ui/Button";
import { FormField } from "../../../../ui/FormField";
import { PasswordInput } from "../../../../ui/PasswordInput";
import { ErrorMessage } from "../../../../ui/ErrorMessage";
import { toMessage } from "../../../../lib/http";
import { useLogin } from "../../hooks/useLogin";
import { loginSchema, type LoginInput } from "../../auth.schema";

/**
 * The form owns field state; the hook owns the request. No fetch here, and no
 * query keys: a mutation that then invalidates a list belongs in the feature.
 */
export const LoginForm = () => {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    // Live validation: the email format is checked as it is corrected after the
    // field has been left, instead of only surfacing on submit.
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit((values) => login.mutate(values))}>
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@business.com"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField label="Password" error={errors.password?.message}>
        {(field) => <PasswordInput autoComplete="current-password" {...field} {...register("password")} />}
      </FormField>

      {login.isError && <ErrorMessage message={toMessage(login.error)} />}

      <Button type="submit" isLoading={login.isPending} disabled={login.isPending} className="w-full">
        {login.isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
};