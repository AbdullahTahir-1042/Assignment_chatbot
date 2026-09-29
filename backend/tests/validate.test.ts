import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import {
  validateBody,
  validateParams,
  validateQuery,
  validatedBody,
  validatedParams,
  validatedQuery,
} from "../src/middleware/validate.js";

/**
 * The accessors are unchecked casts, so nothing about the wiring is checked at
 * compile time. These tests exist because a mismatch between where a validator
 * writes and where a handler reads produced two separate 500s (Phase 3 and
 * Phase 4) that `tsc` could not see.
 */
describe("validator storage", () => {
  it("keeps body, query and params in separate slots", async () => {
    const app = express();
    // Without this, Express 5 leaves req.body undefined, validateBody parses
    // {} and every assertion below fails for a reason that has nothing to do
    // with the thing under test.
    app.use(express.json());
    app.post(
      "/:id",
      validateParams(z.object({ id: z.guid() })),
      validateQuery(z.object({ page: z.coerce.number() })),
      validateBody(z.object({ name: z.string().min(1) })),
      (req, res) => {
        // If any two of these shared a key, whichever validator ran last would
        // have clobbered the others and this would throw.
        const params = validatedParams<{ id: string }>(res);
        const query = validatedQuery<{ page: number }>(res);
        const body = validatedBody<{ name: string }>(res);
        res.json({ ...params, ...query, ...body });
      },
    );

    const res = await request(app)
      .post("/22222222-2222-2222-2222-222222222222")
      .query({ page: "3" })
      .send({ name: "haircut" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "22222222-2222-2222-2222-222222222222", page: 3, name: "haircut" });
  });

  it("makes the coerced value readable from both slots", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/",
      validateBody(z.object({ n: z.coerce.number() })),
      (req, res) => {
        res.json({ fromLocals: validatedBody<{ n: number }>(res).n, fromBody: req.body.n });
      },
    );
    const res = await request(app).post("/").send({ n: "7" });
    expect(res.body).toEqual({ fromLocals: 7, fromBody: 7 });
  });

  it("rejects with 400 and leaves every slot empty", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/",
      validateBody(z.object({ n: z.number() })),
      (_req, res) => res.json({ reached: true, slot: validatedBody(res) ?? null }),
    );
    app.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(400).json({ failed: true });
      },
    );

    const res = await request(app).post("/").send({ n: "not a number" });
    expect(res.status).toBe(400);
    expect(res.body.failed).toBe(true);
    // The handler never runs, so nothing was written: the slot accessors only
    // return a value on the path where the validator succeeded. A route that
    // read the slot before calling next() would see undefined, which is the
    // shape of the 500 that motivated these tests.
    expect(res.body.reached).toBeUndefined();
  });
});
