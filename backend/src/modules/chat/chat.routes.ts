import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody, validateParams, validatedBody, validatedParams } from "../../middleware/validate.js";
import { chatLimiter } from "../../middleware/rateLimiter.js";
import { chatService } from "./chat.service.js";

export const chatRouter = Router();

chatRouter.use(authenticate);

const tenantOf = (res: Response) =>
  res.locals["auth"] as { userId: string; businessId: string };

const messageSchema = z.object({
  sessionId: z.guid("sessionId must be a uuid").optional(),
  text: z.string().trim().min(1, "text must not be empty").max(2000),
});

const sessionParamsSchema = z.object({
  id: z.guid("id must be a uuid"),
});

chatRouter.post(
  "/",
  // Per-user rather than per-IP: a shared office IP should not exhaust one
  // person's allowance, and the AI call behind this is what the limit protects.
  chatLimiter,
  validateBody(messageSchema),
  async (_req: Request, res: Response) => {
    const reply = await chatService.message(
      tenantOf(res),
      validatedBody<z.infer<typeof messageSchema>>(res),
    );
    res.json(reply);
  },
);

chatRouter.get(
  "/:id",
  validateParams(sessionParamsSchema),
  async (_req: Request, res: Response) => {
    const { id } = validatedParams<{ id: string }>(res);
    res.json(await chatService.history(tenantOf(res), id));
  },
);

chatRouter.post(
  "/:id/cancel",
  validateParams(sessionParamsSchema),
  async (_req: Request, res: Response) => {
    const { id } = validatedParams<{ id: string }>(res);
    res.json(await chatService.abandon(tenantOf(res), id));
  },
);
