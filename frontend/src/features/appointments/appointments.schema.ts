import { z } from "zod";

/**
 * The prefill the chat fallback hands over, and the shape the form starts in.
 * All optional, because a draft can hold any subset -- a form that demanded a
 * service on a blank draft would make the fallback unusable.
 */
export const appointmentFormSchema = z.object({
  service: z.string().trim().min(1, "Service is required").max(120, "Service is too long"),
  date: z.string().min(1, "Date is required"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time is required"),
  durationMinutes: z.coerce
    .number()
    .int("Whole minutes only")
    .min(5, "At least 5 minutes")
    .max(480, "At most 480 minutes"),
});

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
