import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../../../ui/Button";
import { FormField } from "../../../../ui/FormField";
import { ErrorMessage } from "../../../../ui/ErrorMessage";
import { toMessage } from "../../../../lib/http";
import { useSignup } from "../../hooks/useSignup";
import { signupSchema, type SignupInput } from "../../auth.schema";

export const SignupForm = () => {
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  return (
    <form className="space-y-3" noValidate onSubmit={handleSubmit((values) => signup.mutate(values))}>
      <FormField label="Name" autoComplete="name" error={errors.name?.message} {...register("name")} />
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
        autoComplete="new-password"
        error={errors.password?.message}
        hint="At least 8 characters."
        {...register("password")}
      />

      {signup.isError && <ErrorMessage message={toMessage(signup.error)} />}

      <Button type="submit" isLoading={signup.isPending} disabled={signup.isPending} className="w-full">
        {signup.isPending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
};
