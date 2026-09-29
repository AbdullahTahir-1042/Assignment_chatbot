import type { Pool } from "pg";
import { AppError } from "../../shared/errors/AppError.js";

/** Columns safe to send to a client. Never add password_hash here. */
export type PublicUser = {
  id: string;
  businessId: string;
  email: string;
  name: string;
  createdAt: string;
};

type UserRow = {
  id: string;
  business_id: string;
  email: string;
  name: string;
  created_at: Date;
};

type UserWithHashRow = UserRow & { password_hash: string };

const toPublic = (row: UserRow): PublicUser => ({
  id: row.id,
  businessId: row.business_id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at.toISOString(),
});

/**
 * Explicit column lists, no `SELECT *`. `password_hash` appears in exactly one
 * query -- findByEmail -- because it is the only code path that authenticates.
 * The other two return PublicUser, and dropping the column there makes a leak
 * structurally impossible rather than something a future edit has to avoid.
 *
 * No 23505 handling here on purpose: the repository is SQL only, and
 * errorHandler already maps users_email_lower_uq to 409 EMAIL_TAKEN. Same
 * design as SLOT_TAKEN.
 */
export const authRepository = {
  async findByEmail(pool: Pool, email: string): Promise<UserWithHashRow | undefined> {
    const { rows } = await pool.query<UserWithHashRow>(
      `SELECT id, business_id, email, password_hash, name, created_at
         FROM users
        WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0];
  },

  async create(
    pool: Pool,
    input: { businessId: string; email: string; passwordHash: string; name: string },
  ): Promise<PublicUser> {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (business_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, business_id, email, name, created_at`,
      [input.businessId, input.email, input.passwordHash, input.name],
    );
    const row = rows[0];
    if (!row) {
      // RETURNING with no row is not reachable for a plain INSERT; treat it as
      // an internal fault rather than inventing a user.
      throw new AppError(500, "INTERNAL", "Internal server error");
    }
    return toPublic(row);
  },

  async findById(pool: Pool, id: string, businessId: string): Promise<PublicUser | null> {
    const { rows } = await pool.query<UserRow>(
      `SELECT id, business_id, email, name, created_at
         FROM users
        WHERE id = $1 AND business_id = $2`,
      [id, businessId],
    );
    const row = rows[0];
    return row ? toPublic(row) : null;
  },
};
