import { request } from "../../lib/http";
import type { ChatHistory, ChatReply } from "./chat.types";

export const chatApi = {
  send: (body: { text: string; sessionId?: string; timezone?: string }) =>
    request<ChatReply>("/chat", { method: "POST", body }),

  history: (sessionId: string, signal?: AbortSignal) =>
    request<ChatHistory>(`/chat/${sessionId}`, ...(signal ? [{ signal }] : [])),

  cancel: (sessionId: string) => request<ChatReply>(`/chat/${sessionId}/cancel`, { method: "POST" }),
};
