import { useMutation } from "@tanstack/react-query";
import { chatApi } from "../chat.api";

/** Ends a session without booking. Same endpoint the "no" path reaches. */
export const useCancelChat = (onReply?: (reply: Awaited<ReturnType<typeof chatApi.cancel>>) => void) =>
  useMutation({
    mutationFn: (sessionId: string) => chatApi.cancel(sessionId),
    ...(onReply ? { onSuccess: onReply } : {}),
  });
