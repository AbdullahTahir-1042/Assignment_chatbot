import { z } from "zod";

/**
 * Mirrors the backend's messageSchema. `timezone` is the client's IANA zone and
 * the backend 400s an invalid one, so validating it here turns a round trip
 * into an inline message.
 */
export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, "Type a message").max(2000, "Message is too long"),
  sessionId: z.string().uuid().optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Could not detect your timezone")
    .optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
