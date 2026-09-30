import { DateTime, IANAZone } from "luxon";

/**
 * Resolves a local wall-clock date and time, in a named IANA zone, to a UTC
 * instant.
 *
 * This is a pure function on purpose. Every date bug in this project lives in
 * this conversion -- the demonstrated "tomorrow" bug was UTC arithmetic applied
 * to a local wall-clock, which is wrong for every user not on UTC -- and a
 * pure function can be tested exhaustively without a model, a network call, or
 * a database.
 *
 * Returns null for anything it cannot resolve without guessing. The caller
 * re-asks; it never invents a time on the user's behalf.
 */
export const resolveLocalToUtc = (input: {
  date: string;
  time: string;
  timezone: string;
  /** Injectable so "now" is fixed in tests. Defaults to the wall clock. */
  now?: DateTime;
}): Date | null => {
  const now = input.now ?? DateTime.now();

  // An unknown zone silently makes Luxon fall back to the host's local zone,
  // which would resolve to a plausible-looking but wrong instant. Reject it.
  if (!IANAZone.isValidZone(input.timezone)) return null;

  const local = DateTime.fromISO(`${input.date}T${input.time}`, { zone: input.timezone });
  if (!local.isValid) return null;

  // A local time inside a DST spring-forward gap does not exist. Luxon reports
  // that as a shift to the next valid instant, so the round trip is the check:
  // formatting back must reproduce what the user asked for, or we guessed.
  if (local.toFormat("yyyy-MM-dd'T'HH:mm") !== `${input.date}T${input.time}`) {
    return null;
  }

  // A user saying "today at 4pm" an hour later must be re-asked, not booked
  // into the past. Compared as instants, so it is correct in any zone.
  if (local.toUTC().toMillis() <= now.toUTC().toMillis()) return null;

  return local.toUTC().toJSDate();
};

/** The prompt's sense of "today", in the user's own zone rather than UTC. */
export const localNowForPrompt = (timezone: string): { date: string; time: string } => {
  if (!IANAZone.isValidZone(timezone)) {
    const utc = DateTime.utc();
    return { date: utc.toFormat("yyyy-MM-dd"), time: utc.toFormat("HH:mm") };
  }
  const local = DateTime.now().setZone(timezone);
  return { date: local.toFormat("yyyy-MM-dd"), time: local.toFormat("HH:mm") };
};

/** "Tue 6 Oct, 4:30 pm" -- the confirmation text, rendered from resolved fields. */
export const formatConfirmation = (input: {
  service: string;
  startsAt: Date;
  timezone: string;
}): string => {
  const local = DateTime.fromJSDate(input.startsAt).setZone(input.timezone);
  if (!local.isValid) {
    return `Book ${input.service}?`;
  }
  return `Book ${input.service} on ${local.toFormat("ccc d LLL")} at ${local.toFormat("h:mm a")}?`;
};

/** The minimum a booking needs before code will offer to confirm it. */
export const BOOKABLE_FIELDS = ["service", "date", "time"] as const;

export const missingBookingFields = (draft: {
  service?: string | undefined;
  date?: string | undefined;
  time?: string | undefined;
}): string[] =>
  BOOKABLE_FIELDS.filter((f) => {
    const v = draft[f];
    return typeof v !== "string" || v.trim() === "";
  });
