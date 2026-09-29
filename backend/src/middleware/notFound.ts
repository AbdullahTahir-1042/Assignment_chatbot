import type { RequestHandler } from "express";
import { NotFoundError } from "../shared/errors/AppError.js";

/**
 * Express 5 requires a *named* wildcard (`/{*splat}`); the old bare `*` is no
 * longer a valid path. Registering this with no path at all also works and
 * matches every method, which is what we want for an API-only server.
 */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError("Route not found"));
};
