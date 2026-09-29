import { describe, expect, it, afterAll, beforeAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";
import { testPool, cleanupByPrefix, uniq } from "./helpers.js";
import type pg from "pg";

const app = createApp();
const pool: pg.Pool = testPool();
let prefix: string;

beforeAll(() => {
  prefix = uniq("err");
});

afterAll(async () => {
  await cleanupByPrefix(pool, prefix);
  await pool.end();
});

describe("error mapping", () => {
  it("404s an unknown route with a JSON envelope", async () => {
    const res = await request(app).get(`/api/${prefix}/nope`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("400s malformed JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.message).toBe("Invalid request body");
  });

  it("413s an oversized body, with a distinct code from malformed JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("content-type", "application/json")
      .send(JSON.stringify({ pad: "x".repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("400s a Zod failure with per-field issues", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    // errorHandler nests the field list at error.details.fields.
    const fields = res.body.error.details?.fields as { path: string; message: string }[];
    expect(Array.isArray(fields)).toBe(true);
    expect(fields.length).toBeGreaterThan(0);
    // Both the offending field and a readable message must reach the client so
    // the form can highlight the input.
    expect(fields.some((f) => f.path === "email")).toBe(true);
    expect(fields.every((f) => typeof f.message === "string" && f.message.length > 0)).toBe(true);
  });

  it("does not leak internals from a real 500", async () => {
    // A 404 proves nothing about 5xx handling: notFound already produced a
    // known AppError. Force the genuine article by rejecting inside the
    // repository, so the raw Error reaches errorHandler unhandled.
    const spy = vi
      .spyOn(authRepository, "findByEmail")
      .mockRejectedValue(new Error("boom-secret-detail"));
    try {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "someone@example.com", password: "whatever-123" });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL");
      expect(res.body.error.message).toBe("Internal server error");
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("boom-secret-detail");
      expect(body).not.toContain("stack");
      expect(res.body.error).not.toHaveProperty("stack");
    } finally {
      spy.mockRestore();
    }
  });
});
