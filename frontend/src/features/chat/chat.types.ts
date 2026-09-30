/** Mirrors the backend's ChatReply exactly. */
export type ChatDraft = {
  service?: string;
  date?: string;
  time?: string;
  durationMinutes?: number;
  startsAtUtc?: string;
  timezone?: string;
};

export type BookedAppointment = {
  id: string;
  service: string;
  startsAt: string;
  durationMinutes: number;
};

export type NeedsFormReason =
  | "ai_unavailable"
  | "ai_unparseable"
  | "ai_truncated"
  | "invalid_time"
  | "unclear";

export type ChatReply = {
  sessionId: string;
  status: "active" | "completed" | "abandoned";
  reply: string;
  draft: ChatDraft;
  needsForm: boolean;
  needsFormReason: NeedsFormReason | null;
  awaitingConfirmation: boolean;
  appointment: BookedAppointment | null;
};

export type ChatMessage = {
  id: string;
  /** Sent by the history endpoint; absent on messages this client rendered. */
  sessionId?: string | undefined;
  role: "user" | "assistant" | "system";
  content: string;
  /** Server-side bookkeeping (kind, model, latency_ms). Never rendered. */
  meta?: Record<string, unknown> | undefined;
  createdAt: string;
};

export type ChatHistory = {
  session: {
    id: string;
    userId: string;
    businessId: string;
    status: "active" | "completed" | "abandoned";
    draft: ChatDraft;
  };
  messages: ChatMessage[];
};
