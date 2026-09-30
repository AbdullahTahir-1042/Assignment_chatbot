import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import { appointmentsApi } from "../appointments.api";

/**
 * Cursor pagination via useInfiniteQuery.
 *
 * pageParam is the nextCursor the server returned, which is a keyset cursor
 * rather than an offset -- the backend orders by (starts_at, id), so OFFSET
 * would skip or repeat rows whenever a booking is inserted while the user is
 * scrolling.
 */
export const useAppointments = () =>
  useInfiniteQuery({
    queryKey: queryKeys.allAppointments,
    queryFn: ({ pageParam, signal }) => appointmentsApi.list(pageParam as string | undefined, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/**
 * Invalidates the list after a create or cancel.
 *
 * Refetching is simpler and more correct than patching the cache: a booking can
 * change a page boundary, and a manual splice is how a duplicate row appears.
 */
export const useInvalidateAppointments = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.allAppointments });
};
