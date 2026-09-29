import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import "dotenv/config";

const file = join(import.meta.dirname, "../../db/seed.sql");
const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error("DATABASE_URL_DIRECT is required for seeding");

const sql = await readFile(file, "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query(sql);
  console.log("seed applied");
} finally {
  await client.end();
}
