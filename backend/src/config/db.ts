import pg from "pg";
import { env } from "./env.js";
import { logger } from "../shared/logger.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * An idle client can fail (Neon suspends the compute, the pooler recycles the
 * socket). Without this listener pg emits an unhandled 'error' event and the
 * process dies.
 */
pool.on("error", (err) => {
  logger.error({ err }, "idle postgres client error");
});

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/**
 * Runs `fn` inside a transaction, passing it a dedicated client. The chat flow
 * needs this to create an appointment and update the session draft atomically.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
