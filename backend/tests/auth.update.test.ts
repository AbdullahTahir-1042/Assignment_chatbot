import { describe, expect, it, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { testPool, cleanupByPrefix, post, uniq, nextIp, asIp } from "./helpers.js";
import type pg from "pg";

const app = createApp();
const pool: pg.Pool = testPool();

const patchMe = (token: string, body: unknown) =>
  request(app)
    .patch("/api/auth/me")
    .set("authorization", `Bearer ${token}`)
    .set("content-type", "application/json")
    .send(body as object);

let prefix: string;
let token: string;
let email: string;

beforeAll(async () => {
  prefix = uniq("upd");
  email = `${prefix}@example.com`;
  const res = await asIp(
    post(app, "/api/auth/signup", { name: "Update Tester", email, password: "correct-horse-battery" }, nextIp()),
    nextIp(),
  );
  token = res.body.token;
});

afterAll(async () => {
  await cleanupByPrefix(pool, prefix);
  await pool.end();
});

describe("PATCH /api/auth/me", () => {
  it("requires a token", async () => {
    const res = await request(app)
      .patch("/api/auth/me")
      .set("content-type", "application/json")
      .send({ name: "No Token", email });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const res = await patchMe(token, { name: "", email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("updates the profile and keeps the token valid", async () => {
    const updatedEmail = `${prefix}_new@example.com`;
    const res = await patchMe(token, { name: "Renamed User", email: updatedEmail });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Renamed User");
    expect(res.body.user.email).toBe(updatedEmail);

    const me = await request(app).get("/api/auth/me").set("authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe("Renamed User");
    expect(me.body.user.email).toBe(updatedEmail);
  });

  it("normalizes case and whitespace on the email", async () => {
    const res = await patchMe(token, { name: "Renamed User", email: `  ${prefix}_upper@EXAMPLE.COM  ` });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(`${prefix}_upper@example.com`);
  });

  it("rejects an email already taken by another user", async () => {
    const taken = `${prefix}_taken@example.com`;
    await asIp(
      post(app, "/api/auth/signup", { name: "Taken", email: taken, password: "correct-horse-battery" }, nextIp()),
      nextIp(),
    );

    const res = await patchMe(token, { name: "Renamed User", email: taken });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("never returns password_hash", async () => {
    const res = await patchMe(token, { name: "Renamed User", email: `${prefix}_final@example.com` });
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });
});