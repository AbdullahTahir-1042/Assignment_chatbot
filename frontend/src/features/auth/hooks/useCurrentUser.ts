import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../../lib/http";
import { queryKeys } from "../../../lib/queryKeys";
import { authApi } from "../auth.api";
import { useAuthStore, selectIsAuthenticated } from "../auth.store";
import type { AuthUser } from "../auth.types";

/**
 * Validates a persisted token.
 *
 * A token in localStorage proves nothing: it may have expired after seven days,
 * been signed with a rotated secret, or belong to a deleted user. This runs
 * once on mount and clears the store on a 401, so a stale token cannot leave
 * the app half-signed-in where every request fails and nothing explains why.
 *
 * Typed to ApiError so callers can branch on `status` instead of on a message.
 */
export const useCurrentUser = () => {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const clear = useAuthStore((s) => s.clear);

  const query = useQuery<AuthUser, ApiError>({
    queryKey: queryKeys.currentUser,
    queryFn: async ({ signal }) => {
      const { user } = await authApi.me(signal);
      useAuthStore.setState({ user });
      return user;
    },
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const isRejected = query.isError && query.error.status === 401;

  // In an effect, not during render: clearing the store mid-render would update
  // a component that is already on the stack.
  useEffect(() => {
    if (isRejected) clear();
  }, [isRejected, clear]);

  return query;
};
