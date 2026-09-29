import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../shared/errors/AppError.js";

export type AuthContext = { userId: string; businessId: string };

/**
 * Lands on res.locals.auth rather than req.user so we never have to augment
 * Express's global Request type -- which is painful under verbatimModuleSyntax.
 */
export const authenticate: (req: Request, res: Response, next: NextFunction) => void = (
  _req,
  res,
  next,
) => {
  const header = _req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing bearer token"));
  }

  const token = header.slice("Bearer ".length);
  try {
    // Pinning the algorithm is what stops an attacker swapping HS512 (or
    // "none") in the header. jwt.verify's type returns `string | JwtPayload`,
    // and JwtPayload's index signature makes custom claims `any`, so every
    // field is narrowed explicitly below.
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (typeof payload === "string") {
      return next(new UnauthorizedError("Malformed token payload"));
    }

    const { sub, businessId } = payload;
    if (typeof sub !== "string" || sub.length === 0) {
      return next(new UnauthorizedError("Malformed token payload"));
    }
    if (typeof businessId !== "string" || businessId.length === 0) {
      return next(new UnauthorizedError("Malformed token payload"));
    }

    res.locals["auth"] = { userId: sub, businessId } satisfies AuthContext;
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
};

export const auth = (res: { locals: Record<string, unknown> }): AuthContext =>
  res.locals["auth"] as AuthContext;
