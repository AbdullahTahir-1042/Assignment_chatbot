import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config, parse } from "dotenv";

/**
 * Refusing to start without .env.test is the whole point of this file.
 *
 * The suites create and delete real rows. Run against the application's own
 * Neon database they would clobber live data, and worse, a half-finished run
 * leaves orphans behind -- which is exactly how two stray businesses ended up
 * in the development database earlier.
 *
 * So this throws rather than falling back. dotenv's default behaviour is
 * additive, which means a missing .env.test would quietly let process.env fall
 * back to .env and point every query at the application database with no
 * warning at all.
 */
const here = import.meta.dirname;
const testEnvPath = resolve(here, "../.env.test");
const appEnvPath = resolve(here, "../.env");

if (!existsSync(testEnvPath)) {
  throw new Error(
    "Missing backend/.env.test -- refusing to run against the application database.\n" +
      "Create a Neon branch, copy .env.test.example to .env.test, paste the branch\n" +
      "connection strings in. A branch is created as a copy of its parent's schema\n" +
      "and data, so it should already contain every migration; verify with:\n" +
      "  $env:DOTENV_CONFIG_PATH='.env.test'; npx tsx -e \"...\n",
  );
}

/**
 * Existence is not enough. The easy mistake is copying the application's
 * connection string into .env.test, which satisfies the check above and
 * recreates the orphan-row problem exactly. A Neon branch has a different
 * hostname from its parent, so this catches the copy-paste.
 */
const hostOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

const testHost = hostOf(parse(readFileSync(testEnvPath, "utf8"))["DATABASE_URL"]);
if (!testHost) {
  throw new Error("backend/.env.test does not define a parseable DATABASE_URL");
}

if (existsSync(appEnvPath)) {
  const appHost = hostOf(parse(readFileSync(appEnvPath))["DATABASE_URL"]);
  if (appHost && appHost === testHost) {
    throw new Error(
      `backend/.env.test points at the same database as backend/.env (${testHost}).\n` +
        "Refusing to run: the test suites delete rows, and pointing them at the\n" +
        "application database is what left orphaned rows behind earlier.\n" +
        "Create a Neon branch and use its own hostname.",
    );
  }
}

config({ path: testEnvPath, override: true });
