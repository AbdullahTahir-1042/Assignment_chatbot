import { describe, expect, it, afterAll, beforeAll } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../src/app.js";
import { testPool, cleanupByPrefix, post, uniq, nextIp, asIp, withAuth } from "./helpers.js";
import type pg from "pg";

const app = createApp();
const pool: pg.Pool = testPool();
let prefix: string;
let token: string;
let userId: string;
let businessId: string;

beforeAll(async () => {
  prefix = uniq("me");
  const email = `${prefix}@example.com`;
  const res = await asIp(
    post(app, "/api/auth/signup", { name: "Me Tester", email, password: "correct-horse-battery" }, nextIp()),
    nextIp(),
  );
  token = res.body.token;
  userId = res.body.user.id;
  businessId = res.body.user.businessId;
});

afterAll(async () => {
  await cleanupByPrefix(pool, prefix);
  await pool.end();
});

describe("GET /api/auth/me", () => {
  it("returns the user for a valid token", async () => {
    const res = await withAuth(app, "/api/auth/me", token);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.email).toBe(`${prefix}@example.com`);
    expect(res.body.user.businessId).toBe(businessId);
  });

  it("never returns password_hash", async () => {
    const res = await withAuth(app, "/api/auth/me", token);
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });
});

describe("token attacks", () => {
  const expect401 = async (label: string, t: string) => {
    const res = await withAuth(app, "/api/auth/me", t);
    expect(res.status, label).toBe(401);
    expect(res.body.error.code, label).toBe("UNAUTHORIZED");
  };

  it("rejects a tampered payload", async () => {
    const [h, p, s] = token.split(".");
    const flipped = p!.slice(0, -2) + (p!.slice(-2) === "AA" ? "BB" : "AA");
    await expect401("tampered", `${h}.${flipped}.${s}`);
  });

  it("rejects an alg=none forgery", async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = b64({ alg: "none", typ: "JWT" });
    const body = b64({ sub: userId, businessId });
    // Unsigned token: the empty signature is what makes it alg=none.
    await expect401("alg=none", `${none}.${body}.`);
  });

  it("rejects an HS512 token, since only HS256 is allowed", async () => {
    const t = jwt.sign({ businessId }, "correct-secret-is-long-enough-for-hs512!!", {
      algorithm: "HS512",
      subject: userId,
    });
    await expect401("HS512", t);
  });

  it("rejects a token signed with a different secret", async () => {
    const t = jwt.sign({ businessId }, "not-the-real-secret-at-all-x", {
      algorithm: "HS256",
      subject: userId,
    });
    await expect401("wrong secret", t);
  });

  it("rejects an expired token", async () => {
    const t = jwt.sign({ businessId }, process.env.JWT_SECRET!, {
      algorithm: "HS256",
      expiresIn: "-1s",
      subject: userId,
    });
    await expect401("expired", t);
  });

  it("rejects a token missing businessId", async () => {
    const t = jwt.sign({}, process.env.JWT_SECRET!, { algorithm: "HS256", subject: userId });
    await expect401("no businessId", t);
  });

  it("rejects a token with a non-string businessId", async () => {
    const t = jwt.sign({ businessId: { $ne: null } }, process.env.JWT_SECRET!, {
      algorithm: "HS256",
      subject: userId,
    });
    await expect401("object businessId", t);
  });

  it("rejects an empty bearer", async () => {
    const res = await request(app).get("/api/auth/me").set("authorization", "Bearer ");
    expect(res.status).toBe(401);
  });

  it("rejects a non-bearer scheme", async () => {
    const res = await request(app).get("/api/auth/me").set("authorization", `Basic ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects garbage", async () => {
    const res = await withAuth(app, "/api/auth/me", "not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("rejects a well-formed token for a deleted user", async () => {
    const doomed = `${prefix}_doomed@example.com`;
    const su = await asIp(
      post(app, "/api/auth/signup", { name: "Doomed", email: doomed, password: "correct-horse-battery" }, nextIp()),
      nextIp(),
    );
    const orphanToken = su.body.token;
    await pool.query("DELETE FROM users WHERE email = $1", [doomed]);
    const res = await withAuth(app, "/api/auth/me", orphanToken);
    expect(res.status).toBe(401);
  });
});
