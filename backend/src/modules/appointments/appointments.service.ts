import type pg from "pg";
import { pool } from "../../config/db.js";
import { ValidationError } from "../../shared/errors/AppError.js";
import type {
  CreateAppointmentInput,
  ListAppointmentsInput,
} from "./appointments.schema.js";
import {
  appointmentRepository,
  type Appointment,
} from "./appointments.repository.js";

type Tenant = { userId: string; businessId: string };

const PAGE_SIZE_CAP = 100;

export const appointmentService = {
  async create(
    db: pg.Pool | pg.PoolClient,
    tenant: Tenant,
    input: CreateAppointmentInput,
    source: Appointment["source"],
  ): Promise<Appointment> {
    const startsAt = new Date(input.startsAt);

    // The schema already rejects past times, but the extractor in Phase 5
    // resolves relative dates ("next Tuesday") and can land on one. Re-checking
    // here keeps that path honest: a booking is never created in the past, no
    // matter which caller asked for it.
    if (startsAt.getTime() <= Date.now()) {
      throw new ValidationError("Appointment time must be in the future", {
        fields: [{ path: "startsAt", message: "Must be in the future" }],
      });
    }

    return appointmentRepository.create(db, {
      userId: tenant.userId,
      businessId: tenant.businessId,
      service: input.service,
      startsAt,
      durationMinutes: input.durationMinutes,
      source,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
  },

  async list(
    tenant: Tenant,
    input: ListAppointmentsInput,
  ): Promise<{ items: Appointment[]; nextCursor: { startsAt: string; id: string } | null }> {
    const rows = await appointmentRepository.list(pool, {
      userId: tenant.userId,
      businessId: tenant.businessId,
      limit: Math.min(input.pageSize, PAGE_SIZE_CAP),
      includeCancelled: input.includeCancelled,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });

    // One extra row was requested; a full page means there is probably more.
    const hasMore = rows.length > input.pageSize;
    const items = hasMore ? rows.slice(0, input.pageSize) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? { startsAt: last.startsAt, id: last.id } : null,
    };
  },

  async cancel(tenant: Tenant, id: string): Promise<Appointment> {
    return appointmentRepository.cancel(pool, id, tenant.userId, tenant.businessId);
  },
};
