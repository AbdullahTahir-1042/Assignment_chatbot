import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { testPool, cleanupByPrefix, post, uniq, nextIp, asIp } from "./helpers.js";
import type pg from "pg";

const app = createApp();
const pool: pg.Pool = testPool();
let prefix: string;
const signups: string[] = [];

beforeAll(async () => {
  prefix = uniq("p3");
});

afterAll(async () => {
  await cleanupByPrefix(pool, prefix);
  await pool.end();
});

const signup = (over: Record<string, unknown> = {}, addr = nextIp()) => {
  const email = (over["email"] as string) ?? `${prefix}_${signups.length}@example.com`;
  if (!(over["email"] as string)) signups.push(email);
  return asIp(post(app, "/api/auth/signup", { name: "Tester", password: "correct-horse-battery", ...over, email }, addr), addr);
};

describe("signup", () => {
  it("returns 201 with a token and a public user", async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.email).toMatch(new RegExp(`^${prefix}_`));
    expect(res.body.user.businessId).toBe(process.env.DEFAULT_BUSINESS_ID);
  });

  it("never returns password_hash, by name or by hash prefix", async () => {
    const res = await signup();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("password_hash");
    expect(body).not.toContain("$2b$");
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("ignores a client-supplied businessId", async () => {
    const res = await signup({ businessId: "11111111-2222-3333-4444-555555555555" });
    expect(res.status).toBe(201);
    expect(res.body.user.businessId).toBe(process.env.DEFAULT_BUSINESS_ID);
  });

  it("stores a bcrypt hash at the configured cost", async () => {
    const email = `${prefix}_cost@example.com`;
    const res = await signup({ email });
    expect(res.status).toBe(201);
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE email = $1", [email]);
    // Asserts the configured cost, not a hardcoded 12: the test environment
    // lowers BCRYPT_COST so the suite is not CPU bound.
    // bcrypt zero-pads the work factor to two digits, so cost 4 appears as 04.
    const cost = String(env.BCRYPT_COST).padStart(2, "0");
    expect(rows[0].password_hash).toMatch(new RegExp(`^\\$2b\\$${cost}\\$`));
  });
});

describe("signup validation", () => {
  it("rejects a password over 72 characters, which bcrypt would truncate", async () => {
    const res = await signup({ password: "x".repeat(73) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a password under 8 characters", async () => {
    expect((await signup({ password: "1234567" })).status).toBe(400);
  });

  it("rejects a malformed email", async () => {
    expect((await signup({ email: "not-an-email" })).status).toBe(400);
  });

  it("rejects a missing name", async () => {
    expect((await signup({ name: "" })).status).toBe(400);
  });
});

describe("email normalization", () => {
  it("maps a duplicate to 409 EMAIL_TAKEN via the error handler, not the repository", async () => {
    const email = `${prefix}_norm@example.com`;
    expect((await signup({ email })).status).toBe(201);
    const dup = await signup({ email: email.toUpperCase() });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("accepts a padded, upper-cased email at login", async () => {
    const email = `${prefix}_pad@example.com`;
    await signup({ email });
    const res = await asIp(
      post(app, "/api/auth/login", { email: `  ${email.toUpperCase()}  `, password: "correct-horse-battery" }),
      nextIp(),
    );
    expect(res.status).toBe(200);
  });
});

describe("login", () => {
  it("returns identical 401 bodies for a wrong password and an unknown email", async () => {
    const email = `${prefix}_login@example.com`;
    await signup({ email });
    const wrongPw = await asIp(post(app, "/api/auth/login", { email, password: "definitely-wrong" }), nextIp());
    const noUser = await asIp(post(app, "/api/auth/login", { email: `${prefix}_ghost@example.com`, password: "definitely-wrong" }), nextIp());
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(JSON.stringify(wrongPw.body)).toBe(JSON.stringify(noUser.body));
    expect(wrongPw.body).not.toHaveProperty("user");
    expect(wrongPw.body).not.toHaveProperty("token");
  });

  it("equalizes timing between the two failure modes", async () => {
    const email = `${prefix}_timing@example.com`;
    await signup({ email });
    // Warm up so first-touch costs do not land in the medians. Each request gets
    // its own IP so the limiter never interferes.
    for (let i = 0; i < 2; i++) {
      await asIp(post(app, "/api/auth/login", { email: `warm${i}@nope.com`, password: "x" }), nextIp());
      await asIp(post(app, "/api/auth/login", { email, password: "x" }), nextIp());
    }
    const ghost: number[] = [];
    const wrongPw: number[] = [];
    for (let i = 0; i < 10; i++) {
      let t = process.hrtime.bigint();
      await asIp(post(app, "/api/auth/login", { email: `${prefix}_g${i}@example.com`, password: "wrong" }), nextIp());
      ghost.push(Number(process.hrtime.bigint() - t) / 1e6);
      t = process.hrtime.bigint();
      await asIp(post(app, "/api/auth/login", { email, password: `wrong-${i}` }), nextIp());
      wrongPw.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    const sorted = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
    const g = sorted(ghost);
    const w = sorted(wrongPw);
    const pct = (Math.abs(g - w) / Math.max(g, w)) * 100;
    expect(pct, `ghost ${g.toFixed(1)}ms vs wrongpw ${w.toFixed(1)}ms`).toBeLessThanOrEqual(30);
  });
});

describe("signupLimiter", () => {
  it("allows 10 per hour from one IP, then 429", async () => {
    // One shared IP: a new IP per request would grant each a full budget.
    const addr = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await signup({ email: `${prefix}_sl${i}@example.com` }, addr);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(statuses[11]).toBe(429);
  });
});
