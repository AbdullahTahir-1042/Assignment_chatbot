import { describe, expect, it, afterAll, beforeAll } from "vitest";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_DIRECT, max: 3 });
let prefix: string;
let businessId: string;
let userA: string;
let userB: string;

const start = (h: number, m: number) => {
  const d = new Date(Date.now() + 3 * 86_400_000);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
};

const insert = (userId: string, startsAt: string, mins: number, status = "confirmed") =>
  pool.query(
    `INSERT INTO appointments (business_id, user_id, service, starts_at, duration_minutes, status, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'form')`,
    [businessId, userId, `${prefix}-svc`, startsAt, mins, status],
  );

beforeAll(async () => {
  prefix = `excl_${Math.random().toString(36).slice(2, 8)}`;
  const biz = await pool.query("SELECT id FROM businesses LIMIT 1");
  businessId = biz.rows[0].id;
  const mk = async (tag: string) => {
    const r = await pool.query(
      `INSERT INTO users (business_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [businessId, `${prefix}_${tag}@example.com`, "$2b$12$" + "a".repeat(53), tag],
    );
    return r.rows[0].id as string;
  };
  userA = await mk("a");
  userB = await mk("b");
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`${prefix}%`]);
  // This suite creates an extra business, and its cleanup used to sit on the
  // success path only, so a failing run left orphans in the shared database.
  await pool.query("DELETE FROM businesses WHERE name LIKE $1", [`${prefix}%`]);
  await pool.end();
});

describe("appointments_no_overlap exclusion", () => {
  it("rejects a partially overlapping booking with 23P01", async () => {
    await insert(userA, start(10, 0), 60);
    const err = await insert(userA, start(10, 30), 60).then(
      () => null,
      (e: pg.DatabaseError) => e,
    );
    expect(err).not.toBeNull();
    expect((err as pg.DatabaseError).code).toBe("23P01");
  });

  it("rejects a fully contained booking", async () => {
    const outer = start(14, 0);
    await insert(userA, outer, 120);
    const err = await insert(userA, start(14, 30), 15).then(
      () => null,
      (e: pg.DatabaseError) => e,
    );
    expect((err as pg.DatabaseError).code).toBe("23P01");
  });

  it("rejects a booking that fully contains an existing one", async () => {
    // Starts before and ends after the inner booking, so the ranges nest
    // rather than merely sharing a start instant.
    const inner = start(17, 0);
    await insert(userA, inner, 15);
    const err = await insert(userA, start(16, 30), 90).then(
      () => null,
      (e: pg.DatabaseError) => e,
    );
    expect((err as pg.DatabaseError).code).toBe("23P01");
  });

  it("rejects a tenant-mismatched appointment", async () => {
    // Migration 006: a composite FK on (user_id, business_id) makes this
    // unrepresentable. Without it the database accepted a cross-tenant row.
    const other = await pool.query("INSERT INTO businesses (name) VALUES ($1) RETURNING id", [
      `${prefix} tenant`,
    ]);
    try {
      const err = await pool
        .query(
          `INSERT INTO appointments (business_id, user_id, service, starts_at, duration_minutes, status, source)
           VALUES ($1, $2, $3, $4, 60, 'confirmed', 'form')`,
          [other.rows[0].id, userA, `${prefix}-svc`, start(9, 0)],
        )
        .then(
          () => null,
          (e: pg.DatabaseError) => e,
        );
      expect((err as pg.DatabaseError).code).toBe("23503");
      expect((err as pg.DatabaseError).constraint).toBe("appointments_user_business_fkey");
    } finally {
      await pool.query("DELETE FROM businesses WHERE name LIKE $1", [`${prefix}%`]);
    }
  });

  it("allows a back-to-back booking (touching ranges do not overlap)", async () => {
    const t = start(20, 0);
    await insert(userA, t, 60);
    await expect(insert(userA, start(21, 0), 60)).resolves.toBeDefined();
  });

  it("allows the same slot once it is cancelled", async () => {
    const { rows } = await pool.query(
      `INSERT INTO appointments (business_id, user_id, service, starts_at, duration_minutes, status, source)
       VALUES ($1, $2, $3, $4, 60, 'confirmed', 'form') RETURNING id`,
      [businessId, userA, `${prefix}-svc`, start(23, 0)],
    );
    // A second identical booking must be blocked while the first is confirmed.
    const err = await insert(userA, start(23, 0), 60).then(
      () => null,
      (e: pg.DatabaseError) => e,
    );
    expect((err as pg.DatabaseError).code).toBe("23P01");
    // Cancelling frees the slot, because the constraint filters on status.
    await pool.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [rows[0].id]);
    await expect(insert(userA, start(23, 0), 60)).resolves.toBeDefined();
  });

  it("treats a race as a win-takes-all: two concurrent inserts, one survives", async () => {
    const t = start(2, 0);
    const results = await Promise.allSettled([
      insert(userB, t, 60),
      insert(userB, t, 60),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe("23P01");
  });

  it("scopes exclusion per business, not globally", async () => {
    // Two businesses, each with its own user, booking the identical wall-clock
    // slot. This is what a multi-tenant booking system must allow: exclusion is
    // scoped to business_id, so a busy salon does not block a different one.
    const t = start(4, 0);
    const other = await pool.query(
      `INSERT INTO businesses (name) VALUES ($1) RETURNING id`,
      [`${prefix} biz`],
    );
    const otherUser = await pool.query(
      `INSERT INTO users (business_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [other.rows[0].id, `${prefix}_ob@example.com`, "$2b$12$" + "a".repeat(53), "ob"],
    );
    await insert(userA, t, 60);
    // The second business' appointment must carry BOTH its own business_id and
    // its own user_id. Pairing userA (business 1) with business 2 is exactly the
    // cross-tenant row that migration 006 now forbids.
    await expect(
      pool.query(
        `INSERT INTO appointments (business_id, user_id, service, starts_at, duration_minutes, status, source)
         VALUES ($1, $2, $3, $4, 60, 'confirmed', 'form')`,
        [other.rows[0].id, otherUser.rows[0].id, `${prefix}-svc`, t],
      ),
    ).resolves.toBeDefined();
  });
});

describe("updated_at trigger", () => {
  it("advances on update", async () => {
    const r = await pool.query(
      `INSERT INTO appointments (business_id, user_id, service, starts_at, duration_minutes, status, source)
       VALUES ($1, $2, $3, $4, 60, 'confirmed', 'form')
       RETURNING id, updated_at, created_at`,
      [businessId, userA, `${prefix}-svc`, start(6, 0)],
    );
    const first = r.rows[0];
    expect(first.updated_at.getTime()).toBeGreaterThanOrEqual(first.created_at.getTime());
    await new Promise((res) => setTimeout(res, 1100));
    const upd = await pool.query(
      "UPDATE appointments SET notes = 'touched' WHERE id = $1 RETURNING updated_at",
      [first.id],
    );
    expect(upd.rows[0].updated_at.getTime()).toBeGreaterThan(first.updated_at.getTime());
  });
});
