import { useMutation } from "@tanstack/react-query";
import { authApi } from "../auth.api";
import { useAuthStore } from "../auth.store";
import type { LoginInput } from "../auth.schema";

/** Login. On success the token lands in the persisted store. */
export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: ({ token, user }) => setSession(token, user),
  });
};
