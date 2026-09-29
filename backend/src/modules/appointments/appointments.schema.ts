import { z } from "zod";

/**
 * Postgres timestamptz has no offset of its own -- it normalizes to UTC on
 * write. Requiring an explicit offset here means the client has to say what
 * wall-clock time it meant, and "2026-10-01T15:00:00" (no offset) is rejected
 * rather than silently interpreted as UTC. In this schema the offset is the
 * browser's IANA zone resolved to an instant; the instant is what we store.
 */
const isoWithOffset = z
  .string()
  .refine((s) => {
    // Date parses a bare local-time string, so require a Z or +/-hh:mm suffix.
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) return false;
    const d = new Date(s);
    return !Number.isNaN(d.getTime());
  }, "startsAt must be an ISO 8601 timestamp with a UTC offset, e.g. 2026-10-01T15:00:00+05:00");

export const createAppointmentSchema = z.object({
  service: z.string().trim().min(1, "Service is required").max(120),
  // Matches the database CHECK (duration_minutes between 5 and 480).
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  startsAt: isoWithOffset,
  notes: z.string().trim().max(1000).optional(),
  // source is deliberately absent: the server decides whether a booking came
  // from the chat extractor or the fallback form, never the client.
})
  // A booking in the past is always a mistake, but "now" cannot be a static
  // schema default, so it is a refinement rather than a field constraint.
  .refine((v) => new Date(v.startsAt).getTime() > Date.now(), {
    message: "startsAt must be in the future",
    path: ["startsAt"],
  });

export const listAppointmentsSchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // Keyset cursor. Opaque to the client: it is the last row's startsAt and id
  // from a previous response, which together are unique and stable.
  cursor: z.string().max(200).optional(),
  includeCancelled: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/** Cursor format is ours, so parsing it belongs next to the schema. */
export const parseCursor = (
  raw: string | undefined,
): { startsAt: string; id: string } | null => {
  if (!raw) return null;
  const [startsAt, id] = raw.split("|");
  if (!startsAt || !id) return null;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime()) || !z.guid().safeParse(id).success) return null;
  return { startsAt: d.toISOString(), id };
};

export const encodeCursor = (c: { startsAt: string; id: string }): string =>
  `${c.startsAt}|${c.id}`;

export const appointmentIdSchema = z.object({
  id: z.guid("id must be a uuid"),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * The raw shape carries `cursor` as an opaque string; the service takes it
 * already decoded. parseCursor rejects a malformed cursor by returning null,
 * which is treated as "start from the beginning" rather than a 400 -- a stale
 * cursor should not break a list the user is looking at.
 */
export type ListAppointmentsInput = Omit<
  z.infer<typeof listAppointmentsSchema>,
  "cursor"
> & {
  cursor?: { startsAt: string; id: string } | undefined;
};
