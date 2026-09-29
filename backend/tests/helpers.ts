import { randomBytes } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import pg from "pg";
import { env } from "../src/config/env.js";

/**
 * Every limiter in this app keys on the client IP, and trust proxy is on, so
 * tests drive isolation with X-Forwarded-For.
 *
 * This mistake was made twice while writing these tests by hand: a "fresh"
 * app instance on a new port still shares authLimiter's store (it is a module
 * level singleton), and a new IP per request hands every request its own full
 * budget so nothing ever trips. Use `ip()` to share a bucket and `nextIp()` to
 * deliberately isolate one.
 */
let ipCounter = 0;
export const nextIp = (): string => {
  // Wrapped in a third octet so the 256th call cannot produce an invalid
  // address like 10.42.0.256.
  const n = ipCounter++;
  return `10.42.${Math.floor(n / 254) % 254}.${(n % 254) + 1}`;
};
export const ip = (tag: string): string => `10.42.255.${tag === "a" ? 1 : 2}`;

export const asIp = (agent: request.Test, addr: string) => agent.set("x-forwarded-for", addr);

export const uniq = (prefix: string): string =>
  `${prefix}_${randomBytes(5).toString("hex")}`;

export const post = (app: Express, path: string, body: unknown, addr?: string) => {
  const r = request(app).post(path).set("content-type", "application/json");
  if (addr) r.set("x-forwarded-for", addr);
  return r.send(body as object);
};

export const withAuth = (app: Express, path: string, token: string) =>
  request(app).get(path).set("authorization", `Bearer ${token}`);

/**
 * Neon is a shared database, so tests must not assume they are the only writer.
 * Every fixture is namespaced by a random prefix and removed in afterAll.
 */
export const testPool = (): pg.Pool =>
  new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });

/**
 * Appointments are namespaced by their `user_id`, and users cascade-delete, so
 * removing test users removes their appointments too.
 */
export const cleanupByPrefix = async (pool: pg.Pool, prefix: string): Promise<void> => {
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`${prefix}%`]);
};

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

export const futureIso = (daysFromNow: number, hour: number): string => {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
