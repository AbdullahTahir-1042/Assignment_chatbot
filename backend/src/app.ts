import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { apiLimiter, chatLimiter } from "./middleware/rateLimiter.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { pool } from "./config/db.js";

/**
 * No listen() here -- server.ts owns the socket so tests can import the app
 * and drive it with supertest without binding a port.
 */
export function createApp() {
  const app = express();

  // Render/Railway sit behind one proxy hop. Without this every request appears
  // to come from the proxy's IP, so the rate limiter would treat all users as one.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger);

  // Liveness: does the process respond at all? Deliberately does NOT touch the
  // database, so a Neon blip cannot get the service killed and restarted in a
  // loop by an orchestrator probing this.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness: can we actually serve traffic? Point the deploy platform's
  // *readiness* probe here, never at /api/health.
  app.get("/api/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ready", database: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", database: "unreachable" });
    }
  });

  app.use("/api/chat", chatLimiter);
  app.use("/api", apiLimiter);

  // authLimiter is deliberately NOT mounted here. It is applied to
  // POST /api/auth/login inside the router so that only credential failures
  // count against the budget. Mounting it across the whole /api/auth prefix
  // would also catch 401s from GET /auth/me, letting a client with a stale
  // token spend the login budget.
  app.use("/api/auth", authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
