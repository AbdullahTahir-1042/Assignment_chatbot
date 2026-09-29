import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  validateBody,
  validateParams,
  validateQuery,
  validated,
  validatedParams,
} from "../../middleware/validate.js";
import {
  appointmentIdSchema,
  createAppointmentSchema,
  encodeCursor,
  listAppointmentsSchema,
  parseCursor,
} from "./appointments.schema.js";
import type { z } from "zod";
import type { CreateAppointmentInput } from "./appointments.schema.js";
import { appointmentService } from "./appointments.service.js";

export const appointmentRouter = Router();

appointmentRouter.use(authenticate);

/** The tenant comes from the verified token, never from the request. */
const tenantOf = (res: Response) =>
  res.locals["auth"] as { userId: string; businessId: string };

appointmentRouter.post(
  "/",
  validateBody(createAppointmentSchema),
  async (req: Request, res: Response) => {
    const appointment = await appointmentService.create(
      pool,
      tenantOf(res),
      validated<CreateAppointmentInput>(res),
      // Source is the server's call: the chat extractor passes "chat", the
      // fallback form passes "form". A client cannot forge it into claiming a
      // booking came from the assistant.
      "form",
    );
    res.status(201).json({ appointment });
  },
);

appointmentRouter.get(
  "/",
  validateQuery(listAppointmentsSchema),
  async (_req: Request, res: Response) => {
    const { cursor: rawCursor, ...query } = validated<
      z.infer<typeof listAppointmentsSchema>
    >(res);
    const cursor = parseCursor(rawCursor);
    const result = await appointmentService.list(tenantOf(res), {
      ...query,
      ...(cursor ? { cursor } : {}),
    });
    res.json({
      appointments: result.items,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    });
  },
);

appointmentRouter.post(
  "/:id/cancel",
  validateParams(appointmentIdSchema),
  async (_req: Request, res: Response) => {
    const { id } = validatedParams<{ id: string }>(res);
    const appointment = await appointmentService.cancel(tenantOf(res), id);
    res.json({ appointment });
  },
);
