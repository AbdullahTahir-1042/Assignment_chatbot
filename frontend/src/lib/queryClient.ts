import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./http";

/**
 * Retries are off by default. A 400 or a 409 will fail identically on the
 * second attempt, and retrying only hides the error from the user while
 * burning the rate-limit budget the backend just spent telling us about.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, err) => {
        if (err instanceof ApiError) {
          // Never retry auth or validation failures; do retry transient ones.
          if (err.status === 0 || err.status >= 500) return failureCount < 2;
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
