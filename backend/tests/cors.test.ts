import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";

/**
 * CORS is resolved per request from an allowlist, so the matching rules are
 * worth pinning: an exact entry, a wildcard subdomain, and the refusals. The
 * wildcard exists because a static host mints a new subdomain for every preview
 * deployment, and that list is unbounded.
 *
 * The env is read at import time, so CORS_ORIGIN is set before the app is
 * imported dynamically. tests/setup.ts does not define it, so nothing overrides
 * this value.
 */
const ALLOWLIST = [
  "http://localhost:5173",
  "https://assignment-chatbot.vercel.app",
  "https://*.vercel.app",
];

process.env["CORS_ORIGIN"] = ALLOWLIST.join(",");

let app: Express;
let health: string;

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  const { env } = await import("../src/config/env.js");
  app = createApp();
  // Parsed into a list, not left as the raw comma string.
  expect(env.CORS_ORIGIN).toEqual(ALLOWLIST);
  health = "/api/health";
});

const allowHeaderFor = async (origin: string | undefined) => {
  const req = request(app).get(health);
  if (origin !== undefined) req.set("Origin", origin);
  const res = await req;
  return { status: res.status, allow: res.headers["access-control-allow-origin"] as string | undefined };
};

describe("CORS allowlist", () => {
  it("echoes an exactly-listed origin", async () => {
    const { allow } = await allowHeaderFor("https://assignment-chatbot.vercel.app");
    expect(allow).toBe("https://assignment-chatbot.vercel.app");
  });

  it("allows a dev origin listed alongside it", async () => {
    const { allow } = await allowHeaderFor("http://localhost:5173");
    expect(allow).toBe("http://localhost:5173");
  });

  it("allows any subdomain of a wildcard entry, so previews work", async () => {
    const { allow } = await allowHeaderFor("https://assignment-chatbot-abc123.vercel.app");
    expect(allow).toBe("https://assignment-chatbot-abc123.vercel.app");
  });

  it("does not treat the wildcard's own parent as a subdomain match", async () => {
    // "https://vercel.app" ends with ".vercel.app"? No -- it has no leading dot,
    // so the suffix check must refuse it.
    const { allow } = await allowHeaderFor("https://vercel.app");
    expect(allow).toBeUndefined();
  });

  it("refuses an unrelated origin by omitting the header", async () => {
    const { status, allow } = await allowHeaderFor("https://evil.example.com");
    expect(allow).toBeUndefined();
    // The request still executes: CORS is a browser policy, and refusing it
    // must not turn into the server rejecting the call.
    expect(status).toBe(200);
  });

  it("refuses a wildcard match on a different scheme", async () => {
    const { allow } = await allowHeaderFor("http://assignment-chatbot-abc123.vercel.app");
    expect(allow).toBeUndefined();
  });

  it("serves a request with no Origin header and emits no CORS headers", async () => {
    const { status, allow } = await allowHeaderFor(undefined);
    expect(status).toBe(200);
    expect(allow).toBeUndefined();
  });
});
