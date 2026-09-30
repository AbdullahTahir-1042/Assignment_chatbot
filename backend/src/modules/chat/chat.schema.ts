import { z } from "zod";

/**
 * What the model is allowed to return: booking FIELDS only.
 *
 * The model never says "create the appointment" and never writes prose. It
 * cannot, because this schema has no field for either. Every reply the user
 * sees is composed in chat.service from these values plus the draft, so what
 * the user confirms is exactly what gets booked.
 */
export const extractedFieldsSchema = z.object({
  service: z.string().min(1).max(120).nullish(),
  /** YYYY-MM-DD in the USER's timezone, as the model resolved it. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .nullish(),
  /** 24h HH:mm in the user's timezone. */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm")
    .nullish(),
  durationMinutes: z.number().int().min(5).max(480).nullish(),
});

export type ExtractedFields = z.infer<typeof extractedFieldsSchema>;

/**
 * The draft is what the model is shown plus what code accumulates. Kept as
 * loose JSON in the database, so it is validated on read rather than trusted:
 * a draft that failed validation is treated as empty, never as a booking.
 */
export const draftSchema = z.object({
  service: z.string().min(1).optional(),
  /** Local wall-clock, exactly as the user said it, pending confirmation. */
  date: z.string().optional(),
  time: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  startsAtUtc: z.string().optional(),
  timezone: z.string().optional(),
});

export type Draft = z.infer<typeof draftSchema>;

/** What the chat response tells the frontend to render next. */
export const needsFormReasonSchema = z.enum([
  "ai_unavailable",
  "ai_unparseable",
  "ai_truncated",
  "invalid_time",
  "unclear",
]);

export type NeedsFormReason = z.infer<typeof needsFormReasonSchema>;

export type ChatReply = {
  sessionId: string;
  status: "active" | "completed" | "abandoned";
  /** Code-written, never model-written. */
  reply: string;
  draft: Draft;
  /** Pre-fill for the fallback form, when the assistant cannot continue. */
  needsForm: boolean;
  needsFormReason: NeedsFormReason | null;
  /** True only when the reply is a yes/no the user must answer. */
  awaitingConfirmation: boolean;
  /** Populated on the turn that actually books. */
  appointment: {
    id: string;
    service: string;
    startsAt: string;
    durationMinutes: number;
  } | null;
};

/** Model contract, in one place so the prompt and the parser cannot drift. */
export const EXTRACTION_PROMPT = `You extract booking fields from a booking conversation.
Reply with a single JSON object and nothing else. No prose, no markdown fence.

Fields: service (string|null), date ("YYYY-MM-DD" in the user's timezone or null),
time ("HH:mm" 24-hour in the user's timezone or null), durationMinutes (number|null).

Rules:
- Return only fields the user has actually stated. Never guess or fill a default.
- Resolve relative dates against the current date given below, in the user's timezone.
- Return null for anything not yet stated.
- Never output a date or time in the past.`;
