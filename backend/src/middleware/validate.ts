import type { RequestHandler } from "express";
import type { z } from "zod";

/**
 * Two single-purpose helpers rather than one `validate({body, query, params})`.
 *
 * Express 5 makes req.query a getter, so assigning to it throws. Body is still
 * assignable, but the parsed value is only trusted because our own middleware
 * wrote it immediately before the handler ran.
 *
 * A thrown ZodError propagates to errorHandler on its own -- Express 5 forwards
 * rejected promises and sync throws from handlers alike.
 */
export const validateBody =
  <S extends z.ZodType>(schema: S): RequestHandler =>
  (req, res, next) => {
    try {
      const parsed = schema.parse(req.body ?? {});
      // Written to BOTH req.body and res.locals so a handler can read either.
      // Writing only to req.body is what made an earlier appointments route
      // read undefined and 500: tsc cannot catch it because the accessors are
      // generic casts, so the mismatch stays invisible to the type checker.
      req.body = parsed;
      res.locals.validatedBody = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };

export const validateQuery =
  <S extends z.ZodType>(schema: S): RequestHandler =>
  (req, res, next) => {
    try {
      // A SEPARATE key from validatedBody. Sharing one key means a route that
      // validates both (a PATCH with a filter, say) silently loses the body to
      // whichever validator ran last. No route does both today, so this was
      // latent rather than live, but it is a trap worth closing now.
      res.locals.validatedQuery = schema.parse(req.query);
      next();
    } catch (err) {
      next(err);
    }
  };

export const validateParams =
  <S extends z.ZodType>(schema: S): RequestHandler =>
  (req, res, next) => {
    try {
      res.locals.validatedParams = schema.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };

/**
 * Typed reads of what the validators stored.
 *
 * Every one of these is a cast, so none can fail at compile time. If the
 * matching validator is missing from the route's middleware chain, they
 * silently yield undefined and the failure surfaces as a 500 far from the
 * cause. They mark which validator belongs on which part of the request --
 * they are not a safety net.
 */
export const validatedBody = <T>(res: { locals: Record<string, unknown> }): T =>
  res.locals.validatedBody as T;

export const validatedQuery = <T>(res: { locals: Record<string, unknown> }): T =>
  res.locals.validatedQuery as T;

export const validatedParams = <T>(res: { locals: Record<string, unknown> }): T =>
  res.locals.validatedParams as T;
