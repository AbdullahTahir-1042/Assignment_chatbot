import { useState } from "react";
import type { BookedAppointment, ChatMessage, ChatReply, NeedsFormReason } from "../chat.types";

/**
 * The live turn state: what the user is looking at right now.
 *
 * Deliberately LOCAL state rather than a query cache entry. A chat transcript
 * is append-only and strictly ordered; round-tripping it through the cache would
 * mean a refetch could reorder or duplicate messages, and every keystroke
 * would invalidate a query. useChatHistory seeds it; nothing else writes to it.
 */
export type ChatSessionState = {
  sessionId: string | null;
  status: "active" | "completed" | "abandoned";
  messages: ChatMessage[];
  draft: ChatReply["draft"];
  awaitingConfirmation: boolean;
  needsForm: boolean;
  needsFormReason: NeedsFormReason | null;
  appointment: BookedAppointment | null;
  /** Client-side ids, since the API returns the reply but not a message id. */
  nextLocalId: () => string;
};

const initial: Omit<ChatSessionState, "nextLocalId"> = {
  sessionId: null,
  status: "active",
  messages: [],
  draft: {},
  awaitingConfirmation: false,
  needsForm: false,
  needsFormReason: null,
  appointment: null,
};

const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useChatSession = () => {
  const [state, setState] = useState(initial);

  return {
    ...state,
    addLocalMessage: (role: ChatMessage["role"], content: string) =>
      setState((s) => ({
        ...s,
        messages: [...s.messages, { id: localId(), role, content, createdAt: new Date().toISOString() }],
      })),
    /** Applies a server reply: appends the assistant turn and adopts its state. */
    applyReply: (reply: ChatReply) =>
      setState((s) => ({
        ...s,
        sessionId: reply.sessionId,
        status: reply.status,
        messages: [...s.messages, { id: localId(), role: "assistant", content: reply.reply, createdAt: new Date().toISOString() }],
        draft: reply.draft,
        awaitingConfirmation: reply.awaitingConfirmation,
        needsForm: reply.needsForm,
        needsFormReason: reply.needsFormReason,
        appointment: reply.appointment,
      })),
    /** Booked or finished: start over on the next message. */
    reset: () => setState(initial),
    seedFromHistory: (messages: ChatMessage[], sessionId: string, status: ChatSessionState["status"], draft: ChatReply["draft"]) =>
      setState((s) => ({
        ...s,
        messages,
        sessionId,
        status,
        draft,
        awaitingConfirmation: Boolean(draft.startsAtUtc) && status === "active",
        needsForm: false,
        needsFormReason: null,
        appointment: null,
      })),
  };
};
