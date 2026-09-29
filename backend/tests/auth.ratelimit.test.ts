import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { createApp } from "../src/app.js";
import { testPool, cleanupByPrefix, post, uniq, nextIp, asIp, ip } from "./helpers.js";
import type pg from "pg";

const app = createApp();
const pool: pg.Pool = testPool();
let prefix: string;
let email: string;
let password = "correct-horse-battery";

beforeAll(async () => {
  prefix = uniq("rl");
  email = `${prefix}@example.com`;
  await asIp(
    post(app, "/api/auth/signup", { name: "RL", email, password }, nextIp()),
    nextIp(),
  );
});

afterAll(async () => {
  await cleanupByPrefix(pool, prefix);
  await pool.end();
});

describe("authLimiter", () => {
  it("never trips on 15 successful logins from one IP", async () => {
    // skipSuccessfulRequests means successes do not consume the budget. This is
    // the assertion that would fail without it.
    const addr = ip("a");
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await asIp(post(app, "/api/auth/login", { email, password }, addr), addr);
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s === 200), `statuses: ${statuses.join(",")}`).toBe(true);
  });

  it("429s on the 21st consecutive failure from a fresh IP", async () => {
    // A distinct IP from the successes above, so that test's budget is intact
    // and this starts from zero.
    const addr = ip("b");
    const seq: number[] = [];
    for (let i = 0; i < 22; i++) {
      const res = await asIp(post(app, "/api/auth/login", { email, password: "wrong" }, addr), addr);
      seq.push(res.status);
    }
    expect(seq.slice(0, 20).every((s) => s === 401), `seq: ${seq.join(",")}`).toBe(true);
    expect(seq[20]).toBe(429);
    expect(seq[21]).toBe(429);
  });

  it("returns the standard error envelope on 429", async () => {
    const addr = ip("b");
    const res = await asIp(post(app, "/api/auth/login", { email, password: "wrong" }, addr), addr);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("blocks even a correct password while locked out", async () => {
    // The block is on the attempt, not on correctness, which is what stops an
    // attacker continuing to guess once the budget is gone.
    const res = await asIp(post(app, "/api/auth/login", { email, password }, ip("b")), ip("b"));
    expect(res.status).toBe(429);
  });
});
