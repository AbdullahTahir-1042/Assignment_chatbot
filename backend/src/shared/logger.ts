import { pino } from "pino";
import { env } from "../config/env.js";

/**
 * pino-pretty is a devDependency, so the transport must never be requested in
 * production -- a production install (`npm ci --omit=dev`) would fail to resolve
 * it and crash the process at import time.
 */
const isProduction = env.NODE_ENV === "production";
// pino-pretty formats every line in process, so under test it is pure overhead
// that also floods the reporter with request dumps. Reuse the production branch
// rather than adding a third case.
const isSilent = env.NODE_ENV === "test";

export const logger = pino({
  level: isSilent ? "silent" : isProduction ? "info" : "debug",
  // pino-http's default request serializer includes the full header bag, which
  // would put every JWT and session cookie in the logs. The child logger it
  // derives inherits these paths, so redact once on the base.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[redacted]",
  },
  ...(isProduction || isSilent
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }),
});
