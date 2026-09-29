import { describe, expect, it, afterAll, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { testPool, cleanupByPrefix, uniq, nextIp, asIp, post } from "./helpers.js";
import type pg from "pg";

const app = createApp();
const pool: pg.Pool = testPool();
let prefix: string;

/**
 * Base day offset, randomized per run. Fixed day/hour slots collide with
 * leftovers from a crashed run: the user prefix is random, so nothing cleans
 * those up, and the next run would 409 on an already-booked slot.
 */
const baseDay = 2 + Math.floor(Math.random() * 40);

/**
 * An ISO instant `days` from now, at a fixed UTC hour. `days` is ABSOLUTE, not
 * relative to baseDay -- baseDay is the per-run collision offset and must be
 * added at the call site. Folding it in here would make futureIso(-2, ...) mean
 * "baseDay - 2 days", i.e. still in the future, which silently broke the
 * past-time test when the randomization was added.
 */
const futureIso = (days: number, hour: number, minute = 0): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
};

/** The same, offset by this run's base day so fixed slots cannot collide. */
const slotIso = (days: number, hour: number, minute = 0): string =>
  futureIso(baseDay + days, hour, minute);

/** An ISO 8601 local wall-clock time at a real non-UTC offset. */
const localWithOffset = (hour: number, minute: number, offsetHours: number): string => {
  const sign = offsetHours >= 0 ? "+" : "-";
  const abs = Math.abs(offsetHours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${new Date(Date.now() + (baseDay + 2) * 86_400_000).toISOString().slice(0, 10)}` +
    `T${pad(hour)}:${pad(minute)}:00${sign}${pad(abs)}:00`
  );
};

type Creds = { token: string; userId: string; email: string };

const newUser = async (tag: string): Promise<Creds> => {
  const email = `${prefix}_${tag}@example.com`;
  const res = await asIp(
    post(app, "/api/auth/signup", { name: tag, email, password: "correct-horse-battery" }, nextIp()),
    nextIp(),
  );
  expect(res.status, `signup ${tag}`).toBe(201);
  return { token: res.body.token, userId: res.body.user.id, email };
};

const book = (c: Creds, body: Record<string, unknown>) =>
  request(app)
    .post("/api/appointments")
    .set("authorization", `Bearer ${c.token}`)
    .send(body);

const cancel = (c: Creds, id: string) =>
  request(app)
    .post(`/api/appointments/${id}/cancel`)
    .set("authorization", `Bearer ${c.token}`);

beforeAll(() => {
  prefix = uniq("appt");
});

afterAll(async () => {
  await cleanupByPrefix(pool, prefix);
  await pool.end();
});

describe("POST /api/appointments", () => {
  it("creates a booking and sets source server-side", async () => {
    const c = await newUser("create");
    const res = await book(c, { service: "Haircut", startsAt: slotIso(1, 10) });
    expect(res.status).toBe(201);
    expect(res.body.appointment.service).toBe("Haircut");
    expect(res.body.appointment.status).toBe("confirmed");
    expect(res.body.appointment.durationMinutes).toBe(30);
    // The route passes "form"; the client cannot influence it.
    expect(res.body.appointment.source).toBe("form");
  });

  it("ignores a client-supplied source", async () => {
    const c = await newUser("srcck");
    const res = await book(c, {
      service: "Colour",
      startsAt: slotIso(1, 11),
      source: "chat",
      status: "pending",
    });
    expect(res.status).toBe(201);
    expect(res.body.appointment.source).toBe("form");
    expect(res.body.appointment.status).toBe("confirmed");
  });

  it("rejects a past start time", async () => {
    const c = await newUser("past");
    const res = await book(c, { service: "Haircut", startsAt: futureIso(-2, 10) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details?.fields as { path: string }[];
    expect(fields.some((f) => f.path === "startsAt")).toBe(true);
  });

  it("rejects a timestamp with no offset", async () => {
    const c = await newUser("nooffset");
    const naive = new Date(Date.now() + 86_400_000).toISOString().replace("Z", "");
    const res = await book(c, { service: "Haircut", startsAt: naive });
    expect(res.status).toBe(400);
  });

  it("accepts a real non-UTC offset and stores the same instant", async () => {
    const c = await newUser("offset");
    // A genuine +05:00 wall-clock string, not a Z swapped for "+00:00" which
    // would still be UTC. 12:30+05:00 is 07:30Z.
    const sent = localWithOffset(12, 30, 5);
    const res = await book(c, { service: "Manicure", startsAt: sent });
    expect(res.status).toBe(201);
    // Compare instants, not the string suffix. toISOString() in the repository
    // always ends in Z, so an endsWith("Z") assertion passes no matter what the
    // database actually stored -- it would not catch a UTC-offset mishandling
    // that shifted the time by five hours.
    expect(new Date(res.body.appointment.startsAt).getTime()).toBe(new Date(sent).getTime());
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .send({ service: "Haircut", startsAt: slotIso(1, 10) });
    expect(res.status).toBe(401);
  });
});

describe("double booking", () => {
  it("resolves a concurrent race to exactly one 201 and one 409 SLOT_TAKEN", async () => {
    const c = await newUser("race");
    const startsAt = slotIso(3, 14);
    // Both requests go through the HTTP layer, so this exercises the same path
    // a real client hits rather than the repository directly.
    const [a, b] = await Promise.all([
      book(c, { service: "Haircut", startsAt, durationMinutes: 60 }),
      book(c, { service: "Haircut", startsAt, durationMinutes: 60 }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe("SLOT_TAKEN");
    // The winner is a real, readable row rather than a stub.
    const winner = a.status === 201 ? a : b;
    expect(winner.body.appointment.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a partial overlap but allows a back-to-back booking", async () => {
    const c = await newUser("adjacent");
    const base = slotIso(4, 9);
    const shift = (mins: number) => new Date(new Date(base).getTime() + mins * 60_000).toISOString();

    expect((await book(c, { service: "A", startsAt: base, durationMinutes: 60 })).status).toBe(201);
    expect((await book(c, { service: "B", startsAt: shift(30), durationMinutes: 30 })).status).toBe(409);
    // Touching ranges do not overlap: 10:00 after a 09:00-10:00 booking.
    expect((await book(c, { service: "C", startsAt: shift(60), durationMinutes: 60 })).status).toBe(201);
  });

  it("frees the slot again after cancellation", async () => {
    const c = await newUser("recancel");
    const startsAt = slotIso(5, 9);
    const first = await book(c, { service: "Haircut", startsAt, durationMinutes: 60 });
    expect(first.status).toBe(201);
    expect((await book(c, { service: "Other", startsAt, durationMinutes: 60 })).status).toBe(409);

    const cancelled = await cancel(c, first.body.appointment.id);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.appointment.status).toBe("cancelled");
    // The row still exists: cancel sets the status, it does not delete.
    const still = await pool.query("SELECT status FROM appointments WHERE id = $1", [
      first.body.appointment.id,
    ]);
    expect(still.rows[0].status).toBe("cancelled");

    expect((await book(c, { service: "Other", startsAt, durationMinutes: 60 })).status).toBe(201);
  });
});

describe("tenant isolation", () => {
  it("404s another user's appointment instead of 403", async () => {
    const owner = await newUser("owner");
    // Same business, different user: this is user-level isolation.
    const intruder = await newUser("intruder");
    const created = await book(owner, { service: "Haircut", startsAt: slotIso(6, 9) });
    expect(created.status).toBe(201);
    const id = created.body.appointment.id;

    // 404 rather than 403: a 403 would confirm the appointment exists, which is
    // an enumeration oracle across tenants.
    const res = await cancel(intruder, id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");

    // And it is not visible in the intruder's list either.
    const list = await request(app)
      .get("/api/appointments")
      .set("authorization", `Bearer ${intruder.token}`);
    expect(list.status).toBe(200);
    expect(list.body.appointments.map((a: { id: string }) => a.id)).not.toContain(id);
    expect(
      (await pool.query("SELECT status FROM appointments WHERE id = $1", [id])).rows[0].status,
    ).toBe("confirmed");
  });

  it("404s across businesses, not just across users", async () => {
    // A second signup lands in DEFAULT_BUSINESS_ID, so a second user alone
    // cannot prove tenant isolation. This needs a token for a user in a
    // different business, which means minting one directly: the point is to
    // hold the *business* different while everything else is normal.
    const owner = await newUser("bizowner");
    const created = await book(owner, { service: "Haircut", startsAt: slotIso(6, 15) });
    expect(created.status).toBe(201);
    const id = created.body.appointment.id;

    // Prefixed so cleanupByPrefix can reach it in afterAll if this test throws
    // before its own finally runs. An unprefixed name is an orphan forever.
    const bizName = `${prefix}_xbiz`;
    const xtenantEmail = `${prefix}_xtenant@example.com`;
    const biz = await pool.query("INSERT INTO businesses (name) VALUES ($1) RETURNING id", [
      bizName,
    ]);
    try {
      const user = await pool.query(
        `INSERT INTO users (business_id, email, password_hash, name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [biz.rows[0].id, xtenantEmail, "$2b$12$" + "a".repeat(53), "xtenant"],
      );
      // Minted the same way auth.service does: HS256, businessId in the payload.
      const token = jwt.sign({ businessId: biz.rows[0].id }, process.env.JWT_SECRET!, {
        algorithm: "HS256",
        expiresIn: "7d",
        subject: user.rows[0].id,
      });

      const res = await request(app)
        .post(`/api/appointments/${id}/cancel`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);

      const list = await request(app)
        .get("/api/appointments")
        .set("authorization", `Bearer ${token}`);
      expect(list.body.appointments).toHaveLength(0);
    } finally {
      // Exact email, NOT a LIKE on the prefix: the owner of the appointment
      // also carries that prefix, and deleting them cascades the appointment
      // away, so the assertion after this block would read undefined and
      // throw a TypeError instead of reporting the real result.
      await pool.query("DELETE FROM users WHERE email = $1", [xtenantEmail]);
      await pool.query("DELETE FROM businesses WHERE name = $1", [bizName]);
    }

    // Untouched by the cross-tenant attempt.
    expect(
      (await pool.query("SELECT status FROM appointments WHERE id = $1", [id])).rows[0].status,
    ).toBe("confirmed");
  });
});

describe("GET /api/appointments", () => {
  it("returns the caller's appointments, paginated with a cursor", async () => {
    const c = await newUser("list");
    for (let i = 0; i < 3; i++) {
      expect(
        (await book(c, { service: `S${i}`, startsAt: slotIso(7, 10 + i) })).status,
      ).toBe(201);
    }
    const page1 = await request(app)
      .get("/api/appointments?pageSize=2")
      .set("authorization", `Bearer ${c.token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.appointments).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get(`/api/appointments?pageSize=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set("authorization", `Bearer ${c.token}`);
    expect(page2.status).toBe(200);
    expect(page2.body.appointments).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    const ids = [...page1.body.appointments, ...page2.body.appointments].map(
      (a: { id: string }) => a.id,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("hides cancelled appointments unless asked", async () => {
    const c = await newUser("hidec");
    const created = await book(c, { service: "Haircut", startsAt: slotIso(8, 9) });
    await cancel(c, created.body.appointment.id);
    const list = await request(app)
      .get("/api/appointments")
      .set("authorization", `Bearer ${c.token}`);
    expect(list.body.appointments).toHaveLength(0);
    const withCancelled = await request(app)
      .get("/api/appointments?includeCancelled=true")
      .set("authorization", `Bearer ${c.token}`);
    expect(withCancelled.body.appointments).toHaveLength(1);
  });

  it("404s cancelling an already-cancelled appointment", async () => {
    const c = await newUser("recancel404");
    const created = await book(c, { service: "Haircut", startsAt: slotIso(9, 9) });
    expect((await cancel(c, created.body.appointment.id)).status).toBe(200);
    expect((await cancel(c, created.body.appointment.id)).status).toBe(404);
  });

  it("400s a non-uuid id", async () => {
    const c = await newUser("badid");
    const res = await cancel(c, "not-a-uuid");
    expect(res.status).toBe(400);
  });
});
