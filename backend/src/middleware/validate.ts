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
  (req, _res, next) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };

export const validateQuery =
  <S extends z.ZodType>(schema: S): RequestHandler =>
  (_req, res, next) => {
    try {
      res.locals.validated = schema.parse(_req.query);
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

/** Typed reads of what the validators stored. */
export const validated = <T>(res: { locals: Record<string, unknown> }): T =>
  res.locals["validated"] as T;

export const validatedParams = <T>(res: { locals: Record<string, unknown> }): T =>
  res.locals["validatedParams"] as T;
