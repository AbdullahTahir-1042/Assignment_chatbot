import { pinoHttp } from "pino-http";
import { logger } from "../shared/logger.js";

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    // Health checks would otherwise dominate the log volume.
    ignore: (req) => req.url === "/api/health",
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
