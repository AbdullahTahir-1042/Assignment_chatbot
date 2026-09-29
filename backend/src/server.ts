import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { logger } from "./shared/logger.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});

/**
 * Render and Railway send SIGTERM on deploy. Closing the listener first stops
 * new connections from arriving; draining the pool then lets in-flight
 * queries finish instead of severing them.
 */
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  server.close(async (err) => {
    if (err) logger.error({ err }, "error closing http server");
    try {
      await pool.end();
      logger.info("pool drained");
    } catch (poolErr) {
      logger.error({ err: poolErr }, "error closing pool");
    }
    process.exit(err ? 1 : 0);
  });

  // Don't hang forever on a stuck connection.
  setTimeout(() => {
    logger.error("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
