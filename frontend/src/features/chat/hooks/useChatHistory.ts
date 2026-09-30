import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import { chatApi } from "../chat.api";

/**
 * Resuming a session. Enabled only once a sessionId exists, which is why it
 * takes it as an argument rather than reading a store -- there is nothing to
 * resume on the first visit.
 */
export const useChatHistory = (sessionId: string | null) =>
  useQuery({
    queryKey: queryKeys.chatHistory(sessionId ?? "none"),
    queryFn: ({ signal }) => chatApi.history(sessionId as string, signal),
    enabled: Boolean(sessionId),
    retry: false,
  });
