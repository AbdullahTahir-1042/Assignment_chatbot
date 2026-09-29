import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../../config/db.js";
import { validateBody } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authLimiter, signupLimiter } from "../../middleware/rateLimiter.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { loginSchema, signupSchema } from "./auth.schema.js";
import type { LoginInput, SignupInput } from "./auth.schema.js";
import { authRepository } from "./auth.repository.js";
import { authService } from "./auth.service.js";

export const authRouter = Router();

// Express 5 forwards rejected promises to the error middleware on its own, so
// these handlers stay plain async functions rather than being wrapped.

authRouter.post(
  "/signup",
  signupLimiter,
  validateBody(signupSchema),
  async (req: Request, res: Response) => {
    // validateBody reassigns req.body with the parsed value, so the cast is
    // justified by the middleware immediately to its left.
    const result = await authService.signup(pool, req.body as SignupInput);
    res.status(201).json(result);
  },
);

authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response) => {
    const result = await authService.login(pool, req.body as LoginInput);
    res.json(result);
  },
);

authRouter.get("/me", authenticate, async (_req: Request, res: Response) => {
  const { userId, businessId } = res.locals["auth"] as {
    userId: string;
    businessId: string;
  };
  const user = await authRepository.findById(pool, userId, businessId);
  if (!user) {
    // Token is well formed but the user is gone (deleted, or moved tenant).
    throw new UnauthorizedError("Invalid or expired token");
  }
  res.json({ user });
});
