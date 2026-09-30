import { useMutation } from "@tanstack/react-query";
import { browserTimezone } from "../../../lib/timezone";
import { chatApi } from "../chat.api";

/**
 * Sends one turn. The browser's IANA zone goes with every message, because the
 * backend resolves relative dates ("tomorrow") in whatever zone it is given and
 * there is no way to infer it server-side.
 */
export const useSendMessage = (onReply: (reply: Awaited<ReturnType<typeof chatApi.send>>) => void) =>
  useMutation({
    mutationFn: (input: { text: string; sessionId?: string | undefined }) =>
      chatApi.send({
        text: input.text,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        timezone: browserTimezone(),
      }),
    onSuccess: onReply,
  });
