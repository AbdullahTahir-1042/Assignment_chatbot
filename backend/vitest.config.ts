import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Loads .env.test, and throws if it is absent. BCRYPT_COST and every other
    // test-only value lives there rather than here, so a test run and a local
    // dev run cannot disagree about which database is in use.
    setupFiles: ["tests/setup.ts"],
    // Neon sits in us-east-2 and every round trip costs ~245ms from Lahore, so
    // the sequential auth and limiter loops are dominated by network latency.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Rate limiters are module level singletons keyed by IP, and several suites
    // share the express app's process. Running files in parallel would let one
    // suite's requests consume another's budget.
    fileParallelism: false,
  },
});
