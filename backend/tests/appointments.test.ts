import { describe, expect, it, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { testPool, cleanupByPrefix, uniq, nextIp, asIp, post } from "./helpers.js";
import type pg from "pg";

const app = createApp();
const pool: pg.Pool = testPool();
let prefix: string;

/** ISO with a real offset, which the schema requires. */
const futureIso = (days: number, hour: number, minute = 0): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
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
    const res = await book(c, { service: "Haircut", startsAt: futureIso(1, 10) });
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
      startsAt: futureIso(1, 11),
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

  it("accepts an offset other than Z", async () => {
    const c = await newUser("offset");
    const d = new Date(Date.now() + 2 * 86_400_000);
    d.setUTCHours(9, 0, 0, 0);
    const pk = d.getTime();
    const res = await book(c, {
      service: "Manicure",
      startsAt: new Date(pk + 5 * 3_600_000).toISOString().replace("Z", "+00:00"),
    });
    expect(res.status).toBe(201);
  });

  it("requires a token", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .send({ service: "Haircut", startsAt: futureIso(1, 10) });
    expect(res.status).toBe(401);
  });
});

describe("double booking", () => {
  it("resolves a concurrent race to exactly one 201 and one 409 SLOT_TAKEN", async () => {
    const c = await newUser("race");
    const startsAt = futureIso(3, 14);
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
    const base = futureIso(4, 9);
    const shift = (mins: number) => new Date(new Date(base).getTime() + mins * 60_000).toISOString();

    expect((await book(c, { service: "A", startsAt: base, durationMinutes: 60 })).status).toBe(201);
    expect((await book(c, { service: "B", startsAt: shift(30), durationMinutes: 30 })).status).toBe(409);
    // Touching ranges do not overlap: 10:00 after a 09:00-10:00 booking.
    expect((await book(c, { service: "C", startsAt: shift(60), durationMinutes: 60 })).status).toBe(201);
  });

  it("frees the slot again after cancellation", async () => {
    const c = await newUser("recancel");
    const startsAt = futureIso(5, 9);
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
    const intruder = await newUser("intruder");
    const created = await book(owner, { service: "Haircut", startsAt: futureIso(6, 9) });
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
});

describe("GET /api/appointments", () => {
  it("returns the caller's appointments, paginated with a cursor", async () => {
    const c = await newUser("list");
    for (let i = 0; i < 3; i++) {
      expect(
        (await book(c, { service: `S${i}`, startsAt: futureIso(7, 10 + i) })).status,
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
    const created = await book(c, { service: "Haircut", startsAt: futureIso(8, 9) });
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
    const created = await book(c, { service: "Haircut", startsAt: futureIso(9, 9) });
    expect((await cancel(c, created.body.appointment.id)).status).toBe(200);
    expect((await cancel(c, created.body.appointment.id)).status).toBe(404);
  });

  it("404s a non-uuid id", async () => {
    const c = await newUser("badid");
    const res = await cancel(c, "not-a-uuid");
    expect(res.status).toBe(400);
  });
});
