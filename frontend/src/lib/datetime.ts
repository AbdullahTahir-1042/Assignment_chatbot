import { browserTimezone } from "./timezone";

/**
 * Local date and time inputs to an ISO instant.
 *
 * This is the one integration detail that decides whether manual booking works
 * at all: the backend REQUIRES an explicit offset on `startsAt` and rejects a
 * bare `YYYY-MM-DDTHH:mm` with 400. An `<input type="date">` and
 * `<input type="time">` give exactly that bare form.
 *
 * `new Date("2026-10-07T16:30")` parses as LOCAL time, not UTC, so toISOString()
 * produces the correct instant -- and it is correct precisely because the
 * browser's zone is the user's zone. No timezone maths, no Luxon on the client.
 */
export const localDateTimeToIso = (date: string, time: string): string => {
  const parsed = new Date(`${date}T${time}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date/time: ${date} ${time}`);
  }
  return parsed.toISOString();
};

/** For `<input type="date" min=...>`: today, in the user's own calendar. */
export const todayInputValue = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/** Shown in the chat confirmation and the appointment list. */
export const formatInUserZone = (iso: string, opts?: Intl.DateTimeFormatOptions): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: browserTimezone(),
    ...opts,
  }).format(date);
};

/** The zoned abbreviation, e.g. "GMT+5", for the confirmation summary. */
export const zoneLabel = (): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: browserTimezone(),
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? browserTimezone();
  } catch {
    return browserTimezone();
  }
};
