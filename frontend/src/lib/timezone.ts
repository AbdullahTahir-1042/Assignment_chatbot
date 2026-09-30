/**
 * The ONLY file that reads the browser's timezone.
 *
 * The backend resolves relative dates ("tomorrow", "next Tuesday") in whatever
 * zone it is given, so a wrong or missing zone means the booking lands on the
 * wrong day for the user. Routing every read through one function means there
 * is one thing to check, and no component invents its own offset logic.
 */
export const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Some locked-down browsers throw here. UTC is the documented fallback and
    // the backend accepts it; a booking an hour out beats no booking at all.
    return "UTC";
  }
};
