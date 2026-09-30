import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../../../ui/Button";
import { FormField } from "../../../../ui/FormField";
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
    defaultValues: { email: "", password: "" },
  });

  return (
    <form className="space-y-3" noValidate onSubmit={handleSubmit((values) => login.mutate(values))}>
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      {login.isError && <ErrorMessage message={toMessage(login.error)} />}

      <Button type="submit" isLoading={login.isPending} disabled={login.isPending} className="w-full">
        {login.isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
};
