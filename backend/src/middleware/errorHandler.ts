import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors/AppError.js";
import { logger } from "../shared/logger.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Tightened to SQLSTATE's five-character format. A bare `"code" in e` also
 * matches Node-level errors such as ECONNRESET or ETIMEDOUT, which would then
 * be mislabelled as "Database error".
 */
const isPgError = (e: unknown): e is PgError =>
  typeof e === "object" &&
  e !== null &&
  "code" in e &&
  typeof (e as { code?: unknown }).code === "string" &&
  /^[0-9A-Z]{5}$/.test((e as { code: string }).code);

/**
 * body-parser failures (express.json()) surface with a `type` like
 * "entity.parse.failed" (400) or "entity.too.large" (413). They are neither
 * AppError nor ZodError, so without this branch a malformed body returns 500.
 */
const isBodyParserError = (e: unknown): e is { status: number; type: string } =>
  typeof e === "object" &&
  e !== null &&
  "type" in e &&
  typeof (e as { type?: unknown }).type === "string" &&
  (e as { type: string }).type.startsWith("entity.") &&
  "status" in e &&
  typeof (e as { status?: unknown }).status === "number";

/**
 * Postgres is the source of truth for double-booking. We deliberately do NOT
 * pre-check slot availability in application code: a SELECT-then-INSERT races
 * under concurrent requests, and only the exclusion constraint is atomic.
 * We translate its error instead.
 */
function fromPgError(err: PgError): AppError | null {
  switch (err.code) {
    case "23P01":
      return new AppError(
        409,
        "SLOT_TAKEN",
        "That time slot is no longer available",
      );
    case "23505":
      if (err.constraint === "users_email_lower_uq") {
        return new AppError(409, "EMAIL_TAKEN", "Email already registered");
      }
      return new AppError(409, "DUPLICATE", "That record already exists");
    case "23503":
      return new AppError(
        400,
        "INVALID_REFERENCE",
        "Referenced record does not exist",
      );
    case "23514":
      return new AppError(400, "CHECK_VIOLATION", "Value failed a constraint");
    default:
      return null;
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError(400, "VALIDATION_ERROR", "Validation failed", {
      fields: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  } else if (isBodyParserError(err)) {
    // Distinguish "too large" from "malformed" so a client can react
    // differently without having to infer intent from the status alone.
    appError =
      err.type === "entity.too.large"
        ? new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large")
        : new AppError(err.status, "BAD_REQUEST", "Invalid request body");
  } else if (isPgError(err)) {
    appError = fromPgError(err) ?? new AppError(500, "INTERNAL", "Database error");
  } else {
    appError = new AppError(500, "INTERNAL", "Internal server error");
  }

  const status = appError.status;
  if (status >= 500) {
    // Never leak internals on a 5xx -- the real cause goes to the log only.
    logger.error({ err }, "unhandled error");
  } else {
    logger.warn({ code: appError.code, msg: appError.message }, "request rejected");
  }

  res.status(status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  });
};
