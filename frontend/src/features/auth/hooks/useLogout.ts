import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth.store";

export const useLogout = () => {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return {
    logout: () => {
      clear();
      // Sign-out must not leave the previous user's appointments in the cache
      // for whoever signs in next on this browser. Clearing is blunt but
      // correct; selectively invalidating is a bug waiting to happen.
      queryClient.clear();
    },
  };
};
