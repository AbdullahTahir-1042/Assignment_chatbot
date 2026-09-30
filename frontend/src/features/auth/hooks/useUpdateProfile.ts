import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../auth.api";
import { useAuthStore } from "../auth.store";
import { queryKeys } from "../../../lib/queryKeys";
import type { UpdateProfileInput } from "../auth.schema";

/**
 * Saves edited profile fields. On success the fresh user lands in both the
 * store (drives the header menu) and the currentUser query cache (drives
 * anything reading useCurrentUser), so no part of the app keeps a stale copy.
 */
export const useUpdateProfile = () => {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => authApi.updateProfile(input),
    onSuccess: ({ user }) => {
      setUser(user);
      queryClient.setQueryData(queryKeys.currentUser, user);
    },
  });
};