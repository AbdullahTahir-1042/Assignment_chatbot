import { useMutation } from "@tanstack/react-query";
import { authApi } from "../auth.api";
import { useAuthStore } from "../auth.store";
import type { SignupInput } from "../auth.schema";

/** Signup. The backend returns a token directly, so there is no login step after. */
export const useSignup = () => {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: SignupInput) => authApi.signup(input),
    onSuccess: ({ token, user }) => setSession(token, user),
  });
};
