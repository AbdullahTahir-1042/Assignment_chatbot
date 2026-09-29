import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "../shared/errors/AppError.js";

const shared = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  handler: (
    _req: Request,
    _res: Response,
    next: NextFunction,
  ) => next(new AppError(429, "RATE_LIMITED", "Too many requests")),
};

/**
 * Signup is expensive: every call runs bcrypt at cost 12, so ~250ms of CPU.
 * apiLimiter's 300 per 15 minutes would allow 75 seconds of sustained CPU burn
 * from a single IP, and unlike login there is no "failed attempt" to skip --
 * a script generating throwaway accounts never returns a 401.
 */
export const signupLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

/**
 * Credential stuffing surface: tight budget, long window.
 *
 * `skipSuccessfulRequests` means the budget counts FAILED attempts only, which
 * is the point of the limiter. Counting successes would let anyone lock
 * themselves out by logging in and out repeatedly -- the legitimate user is
 * the one harmed, while the attacker's wrong passwords still count.
 *
 * Note this makes the counter asymmetric: a burst of 429s is only possible
 * after failures, and a 401 response is a failed attempt.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  // 20 rather than the textbook 10: the lockout is per-IP for 15 minutes, so on
  // a shared network (office wifi, a demo laptop, an interviewer's VPN) a
  // handful of real people can trip it for each other. Raise this and the
  // credential-stuffing window widens with it.
  limit: 20,
  skipSuccessfulRequests: true,
});

/**
 * Every chat turn costs a Groq call, so this is also the spend limiter.
 * Deliberately looser than auth -- a real conversation is more than 10 turns.
 */
export const chatLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 20,
});

/** Default for the rest of the API. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 300,
});
