import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { resolveLocalToUtc, localNowForPrompt, formatConfirmation } from "../src/modules/chat/ai.extractor.js";

/**
 * No model, no network, no database. The demonstrated "tomorrow" bug was UTC
 * arithmetic applied to a local wall-clock, so these are the tests that decide
 * whether the booking lands on the day the user meant.
 */
describe("resolveLocalToUtc", () => {
  const KARACHI = "Asia/Karachi"; // UTC+5, no DST
  const NEW_YORK = "America/New_York"; // UTC-5/-4, DST
  // A fixed "now" so "today" and "tomorrow" are unambiguous.
  const now = DateTime.fromISO("2026-10-06T09:00:00Z"); // Tue 6 Oct, 09:00Z

  it("reads a local wall-clock as local, not as UTC", () => {
    // 16:30 in Karachi is 11:30Z. Treating the wall-clock as UTC would give
    // 16:30Z, a five-hour error.
    const got = resolveLocalToUtc({ date: "2026-10-07", time: "16:30", timezone: KARACHI });
    expect(got).not.toBeNull();
    expect(got!.toISOString()).toBe("2026-10-07T11:30:00.000Z");
  });

  it("agrees with UTC when the zone is UTC", () => {
    const got = resolveLocalToUtc({ date: "2026-10-07", time: "16:30", timezone: "UTC", now });
    expect(got!.toISOString()).toBe("2026-10-07T16:30:00.000Z");
  });

  it("resolves 'tomorrow' differently per timezone, from the same local date", () => {
    // The bug this guards: one UTC "tomorrow" applied to everyone.
    const karachi = resolveLocalToUtc({ date: "2026-10-07", time: "16:30", timezone: KARACHI, now });
    const newYork = resolveLocalToUtc({ date: "2026-10-07", time: "16:30", timezone: NEW_YORK, now });
    expect(karachi!.toISOString()).toBe("2026-10-07T11:30:00.000Z");
    // 16:30 in New York during EDT is 20:30Z -- nine hours later in the day
    // than the Karachi instant for the same local wall-clock.
    expect(newYork!.toISOString()).toBe("2026-10-07T20:30:00.000Z");
  });

  it("returns null for a time already past, in the user's own zone", () => {
    // 10:00 on 6 Oct is 05:00Z, which is before now (09:00Z).
    const got = resolveLocalToUtc({ date: "2026-10-06", time: "10:00", timezone: KARACHI, now });
    expect(got).toBeNull();
  });

  it("accepts a time that is today in the user's zone but already past in UTC", () => {
    // 23:00 in Karachi on 6 Oct is 18:00Z -- future. The mirror case: 01:00 in
    // New York on 6 Oct is 05:00Z, which is before now, so it must be refused
    // even though the user said "today".
    expect(
      resolveLocalToUtc({ date: "2026-10-06", time: "23:00", timezone: KARACHI, now }),
    ).not.toBeNull();
    expect(
      resolveLocalToUtc({ date: "2026-10-06", time: "01:00", timezone: NEW_YORK, now }),
    ).toBeNull();
  });

  it("refuses a local time inside a DST spring-forward gap", () => {
    // US DST 2026 starts Sun 8 Mar. 02:30 does not exist in New York that day.
    const got = resolveLocalToUtc({ date: "2026-03-08", time: "02:30", timezone: NEW_YORK });
    expect(got).toBeNull();
  });

  it("handles a DST fall-back hour, where the wall-clock occurs twice", () => {
    // US DST 2026 ends Sun 1 Nov; 01:30 happens twice in New York. Luxon
    // resolves to the first (EDT, -4). What matters is that it resolves
    // deterministically rather than being rejected.
    const got = resolveLocalToUtc({ date: "2026-11-01", time: "01:30", timezone: NEW_YORK });
    expect(got).not.toBeNull();
    expect(got!.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("returns null for an unknown timezone rather than silently using the host's", () => {
    // The failure this prevents: Luxon falls back to the host zone, producing a
    // plausible instant that is wrong for the user.
    expect(
      resolveLocalToUtc({ date: "2026-10-07", time: "16:30", timezone: "Not/AZone" }),
    ).toBeNull();
    expect(
      resolveLocalToUtc({ date: "2026-10-07", time: "16:30", timezone: "GMT+5" }),
    ).toBeNull();
  });

  it("returns null for malformed dates and times", () => {
    for (const bad of [
      { date: "2026-13-45", time: "10:00" },
      { date: "07/10/2026", time: "10:00" },
      { date: "2026-10-07", time: "25:00" },
      { date: "2026-10-07", time: "10:70" },
      { date: "not-a-date", time: "10:00" },
    ]) {
      expect(
        resolveLocalToUtc({ ...bad, timezone: KARACHI }),
        `${bad.date} ${bad.time}`,
      ).toBeNull();
    }
  });
});

describe("localNowForPrompt", () => {
  it("gives the date in the requested zone, not UTC", () => {
    // 23:30Z on 6 Oct is already 7 Oct in Karachi (UTC+5).
    const spy = DateTime.now();
    expect(spy.isValid).toBe(true);
    const karachi = localNowForPrompt("Asia/Karachi");
    expect(karachi.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(karachi.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it("falls back to UTC for an invalid zone instead of throwing", () => {
    const got = localNowForPrompt("Not/AZone");
    expect(got.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatConfirmation", () => {
  it("renders the local wall-clock the user will be shown", () => {
    const startsAt = new Date("2026-10-07T11:30:00.000Z");
    const text = formatConfirmation({
      service: "Haircut",
      startsAt,
      timezone: "Asia/Karachi",
    });
    expect(text).toBe("Book Haircut on Wed 7 Oct at 4:30 PM?");
  });

  it("is built from resolved fields, so it can only ever state what will be booked", () => {
    const startsAt = new Date("2026-10-07T16:30:00.000Z");
    const ny = formatConfirmation({ service: "Colour", startsAt, timezone: "America/New_York" });
    expect(ny).toContain("Colour");
    expect(ny).toContain("?");
  });
});
