import "dotenv/config";
import { z } from "zod";

/**
 * One entry of the CORS allowlist: "*", an exact origin, or a wildcard
 * subdomain pattern like "https://*.vercel.app".
 *
 * A path or a trailing slash is rejected on purpose. The cors middleware
 * compares against the browser's Origin header, which never carries either, so
 * "https://app.example.com/" would parse fine here and then never match
 * anything at runtime.
 */
const ORIGIN_ENTRY = /^(?:\*|https?:\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::\d{1,5})?)$/i;

/**
 * Parsed once at import time so a misconfigured environment kills the process
 * at boot rather than at the first request that happens to need the value.
 *
 * DATABASE_URL_DIRECT is deliberately absent: only the migrate/seed scripts
 * read it, and requiring it would break a deployment that never migrates.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  GROQ_API_KEY: z.string().min(1),
  /**
   * Default is openai/gpt-oss-120b, NOT llama-3.3-70b-versatile: the latter was
   * retired by Groq in Aug 2026 and is now Enterprise-only, so it fails on a
   * self-serve key. 120b is the current free-tier quality default and supports
   * strict JSON output, which ai.guardrails.ts depends on.
   */
  AI_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  // z.guid(), not z.uuid(): z.uuid() additionally enforces RFC 9562 version
  // and variant bits, which Postgres's uuid type does not require. The seeded
  // DEFAULT_BUSINESS_ID (00000000-...-0001) is a valid Postgres uuid but has
  // version/variant nibbles of 0, so z.uuid() would reject a value the
  // database itself accepts.
  DEFAULT_BUSINESS_ID: z.guid(),
  /**
   * Comma-separated allowlist, so one variable can carry dev, preview and
   * production origins at once. A single origin still works and parses as a
   * one-entry list. The wildcard form exists because a static host mints a new
   * subdomain for every preview deployment, and a list of those is unbounded.
   */
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((raw) =>
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .refine((origins) => origins.length > 0, "CORS_ORIGIN must list at least one origin")
    .refine(
      (origins) => origins.every((entry) => ORIGIN_ENTRY.test(entry)),
      'CORS_ORIGIN entries must be "*", or an origin such as https://app.example.com or https://*.example.com (no path, no trailing slash)',
    ),
  /**
   * bcrypt work factor. 12 is the production default. The test suite sets 4,
   * because it performs 60+ cost-12 hashes and compares; at 12 that is ~13s of
   * pure CPU, which dominates the run. Only the cost varies between the two --
   * the algorithm, salt handling and 72-byte truncation all behave identically,
   * so nothing under test is weakened by lowering it.
   */
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment:\n${detail}`);
}

export const env = parsed.data;
export type Env = typeof env;
