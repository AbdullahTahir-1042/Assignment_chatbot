import type pg from "pg";
import { NotFoundError } from "../../shared/errors/AppError.js";

/**
 * Accepts Pool | PoolClient so Phase 5 can call these inside withTransaction
 * when a booking and the session draft have to commit together. A Pool and a
 * PoolClient expose the same query interface; the difference is that a
 * PoolClient's queries join an open transaction and a Pool's do not.
 */
type Db = Pick<pg.Pool, "query">;

export type Appointment = {
  id: string;
  businessId: string;
  userId: string;
  service: string;
  startsAt: string;
  durationMinutes: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  source: "chat" | "form";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  business_id: string;
  user_id: string;
  service: string;
  starts_at: Date;
  duration_minutes: number;
  status: Appointment["status"];
  source: Appointment["source"];
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

const toAppointment = (r: Row): Appointment => ({
  id: r.id,
  businessId: r.business_id,
  userId: r.user_id,
  service: r.service,
  startsAt: r.starts_at.toISOString(),
  durationMinutes: r.duration_minutes,
  status: r.status,
  source: r.source,
  notes: r.notes,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/**
 * No SQL mapping of error codes here. errorHandler owns 23505 -> EMAIL_TAKEN and
 * 23P01 -> SLOT_TAKEN, so a double booking surfaces the same way whether the
 * INSERT came from this module or anywhere else. Keeping the repository to
 * plain SQL is why the same rule holds for the chat flow in Phase 5.
 */
export const appointmentRepository = {
  async create(
    db: Db,
    input: {
      userId: string;
      businessId: string;
      service: string;
      startsAt: Date;
      durationMinutes: number;
      source: Appointment["source"];
      notes?: string | undefined;
    },
  ): Promise<Appointment> {
    const { rows } = await db.query<Row>(
      `INSERT INTO appointments
         (business_id, user_id, service, starts_at, duration_minutes, status, source, notes)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7)
       RETURNING id, business_id, user_id, service, starts_at, duration_minutes,
                 status, source, notes, created_at, updated_at`,
      [
        input.businessId,
        input.userId,
        input.service,
        input.startsAt.toISOString(),
        input.durationMinutes,
        input.source,
        input.notes ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("INSERT ... RETURNING produced no row");
    return toAppointment(row);
  },

  /**
   * Scoped by user_id AND business_id, never by id alone. The composite
   * business_id predicate is what makes this safe: a token carries both, so
   * another tenant's appointment is simply not in the result set rather than
   * being found and then rejected.
   */
  async findById(
    db: Db,
    id: string,
    userId: string,
    businessId: string,
  ): Promise<Appointment | null> {
    const { rows } = await db.query<Row>(
      `SELECT id, business_id, user_id, service, starts_at, duration_minutes,
              status, source, notes, created_at, updated_at
         FROM appointments
        WHERE id = $1 AND user_id = $2 AND business_id = $3`,
      [id, userId, businessId],
    );
    const row = rows[0];
    return row ? toAppointment(row) : null;
  },

  /**
   * Keyset pagination on (starts_at, id) rather than OFFSET: offset pagination
   * skips or repeats rows when an appointment is inserted mid-scroll, and this
   * is a live booking list where that is visible.
   *
   * Ascending by start time, cancelled rows excluded by default since the
   * exclusion constraint treats them as free slots.
   */
  async list(
    db: Db,
    input: {
      userId: string;
      businessId: string;
      limit: number;
      cursor?: { startsAt: string; id: string } | undefined;
      includeCancelled: boolean;
    },
  ): Promise<Appointment[]> {
    // Only parameters the SQL actually references. Postgres rejects an unused
    // one outright ("could not determine data type of parameter $3"), so the
    // limit is pushed later alongside its own placeholder rather than reserved
    // here.
    const params: unknown[] = [input.userId, input.businessId];
    const where: string[] = ["user_id = $1", "business_id = $2"];

    if (!input.includeCancelled) {
      where.push(`status <> 'cancelled'`);
    }
    if (input.cursor) {
      params.push(input.cursor.startsAt, input.cursor.id);
      where.push(`(starts_at, id) > ($${params.length - 1}, $${params.length})`);
    }
    params.push(input.limit + 1);

    const { rows } = await db.query<Row>(
      `SELECT id, business_id, user_id, service, starts_at, duration_minutes,
              status, source, notes, created_at, updated_at
         FROM appointments
        WHERE ${where.join(" AND ")}
        ORDER BY starts_at ASC, id ASC
        LIMIT $${params.length}`,
      params,
    );
    return rows.map(toAppointment);
  },

  /**
   * Cancel by setting the status, never by deleting. The row is the audit trail,
   * and appointments_no_overlap filters on `status <> 'cancelled'`, so the
   * slot becomes bookable again without losing the history.
   */
  async cancel(
    db: Db,
    id: string,
    userId: string,
    businessId: string,
  ): Promise<Appointment> {
    const { rows } = await db.query<Row>(
      `UPDATE appointments
          SET status = 'cancelled'
        WHERE id = $1 AND user_id = $2 AND business_id = $3
          AND status <> 'cancelled'
      RETURNING id, business_id, user_id, service, starts_at, duration_minutes,
                status, source, notes, created_at, updated_at`,
      [id, userId, businessId],
    );
    const row = rows[0];
    if (!row) {
      // Either it does not exist, belongs to someone else, or is already
      // cancelled. All three are a 404: distinguishing them would leak whether
      // a given appointment id exists.
      throw new NotFoundError("Appointment not found");
    }
    return toAppointment(row);
  },
};
