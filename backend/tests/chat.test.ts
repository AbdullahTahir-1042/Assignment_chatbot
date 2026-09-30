import { describe, expect, it, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import type pg from "pg";

/**
 * The model is mocked for every test in this file. The real Groq free tier is
 * ~30 requests a minute and the tests would be slow and flaky against it; more
 * importantly, every failure path here (parse error, truncation, 429, 401) is
 * then a deterministic canned return rather than something to provoke with a
 * live API call.
 */
const complete = vi.fn();

vi.mock("../src/modules/chat/ai.client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/modules/chat/ai.client.js")>();
  return { ...actual, complete: (...args: unknown[]) => complete(...args) };
});

const { createApp } = await import("../src/app.js");
const { testPool, cleanupByPrefix, uniq, nextIp, asIp, post } = await import("./helpers.js");

const app = createApp();
const pool: pg.Pool = testPool();
const prefix = uniq("chat");

type Creds = { token: string; userId: string; email: string; ip: string };

/**
 * Each test user gets its OWN IP, and every request for that user reuses it.
 *
 * Both halves matter. A shared IP exhausts chatLimiter's 20/minute budget part
 * way through the file, so later assertions run against 429s instead of the
 * behaviour under test. A NEW ip per request goes the other way and never trips
 * anything, which is the mistake the helpers.ts comment warns about. One IP per
 * user, reused for all of that user's requests, is what a real client does.
 */
const signup = async (tag: string): Promise<Creds> => {
  const email = `${prefix}_${tag}@example.com`;
  const ip = nextIp();
  const res = await asIp(
    post(app, "/api/auth/signup", { name: tag, email, password: "correct-horse-battery" }, ip),
    ip,
  );
  expect(res.status, `signup ${tag}`).toBe(201);
  return { token: res.body.token, userId: res.body.user.id, email, ip };
};

const say = (c: Creds, text: string, sessionId?: string) =>
  asIp(
    request(app)
      .post("/api/chat")
      .set("authorization", `Bearer ${c.token}`)
      .send({ text, ...(sessionId ? { sessionId } : {}) }),
    c.ip,
  );

const ok = (fields: Record<string, unknown>) => ({
  ok: true as const,
  fields: {
    service: null,
    date: null,
    time: null,
    durationMinutes: null,
    ...fields,
  },
  // snake_case: jsonb lowercases keys on the way in, so camelCase here would
  // never match what comes back out of the database.
  usage: {
    prompt_tokens: 120,
    completion_tokens: 30,
    reasoning_tokens: 40,
    finish_reason: "stop",
    latency_ms: 900,
  },
});

const fail = (reason: string, detail = "test") => ({
  ok: false as const,
  reason: reason as "ai_unparseable" | "ai_truncated" | "ai_unavailable",
  detail,
  usage: {
    prompt_tokens: 120,
    completion_tokens: 10,
    reasoning_tokens: 0,
    finish_reason: reason,
    latency_ms: 300,
  },
});

/** A date far enough ahead that the past check cannot interfere. */
const soon = (daysAhead: number): string => {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
};

// Per-test reset, so a leftover mockResolvedValueOnce cannot satisfy the next
// test's first call and hide a real behaviour.
beforeEach(() => {
  complete.mockReset();
});

afterAll(async () => {
  await cleanupByPrefix(pool, prefix);
  await pool.end();
});

describe("chat: happy path", () => {
  it("collects fields over turns, confirms, then books only on yes", async () => {
    const c = await signup("happy");
    complete.mockResolvedValueOnce(ok({ service: "Haircut" }));

    const first = await say(c, "I want a haircut");
    expect(first.status).toBe(200);
    expect(first.body.needsForm).toBe(false);
    expect(first.body.draft.service).toBe("Haircut");
    expect(first.body.awaitingConfirmation).toBe(false);
    // Asks for one missing field, not all of them.
    expect(first.body.reply).toMatch(/date/i);
    const sessionId = first.body.sessionId as string;

    const date = soon(6);
    complete.mockResolvedValueOnce(ok({ date }));
    const second = await say(c, `on ${date}`, sessionId);
    expect(second.body.draft.service).toBe("Haircut");
    expect(second.body.draft.date).toBe(date);
    expect(second.body.reply).toMatch(/time/i);
    expect(second.body.awaitingConfirmation).toBe(false);

    complete.mockResolvedValueOnce(ok({ time: "16:30" }));
    const third = await say(c, "4:30 in the afternoon", sessionId);
    expect(third.body.awaitingConfirmation).toBe(true);
    expect(third.body.draft.startsAtUtc).toBeTruthy();
    // The confirmation text is built by code from the resolved fields.
    expect(third.body.reply).toMatch(/^Book Haircut on .* at .*\?$/);
    expect(third.body.appointment).toBeNull();

    // Confirming: no model call at all, the decision does not go through an LLM.
    complete.mockClear();
    const yes = await say(c, "yes", sessionId);
    expect(complete).not.toHaveBeenCalled();
    expect(yes.body.status).toBe("completed");
    expect(yes.body.appointment).not.toBeNull();
    expect(yes.body.appointment.service).toBe("Haircut");
    expect(yes.body.appointment.startsAt.endsWith("Z")).toBe(true);

    // The appointment is real, tenant-scoped, and sourced from chat.
    const row = await pool.query(
      "SELECT source, status, user_id FROM appointments WHERE id = $1",
      [yes.body.appointment.id],
    );
    expect(row.rows[0].source).toBe("chat");
    expect(row.rows[0].status).toBe("confirmed");
    expect(row.rows[0].user_id).toBe(c.userId);

    // The session is completed in the same transaction as the insert.
    const session = await pool.query("SELECT status FROM chat_sessions WHERE id = $1", [sessionId]);
    expect(session.rows[0].status).toBe("completed");
  });

  it("keeps already-collected fields when the model returns nulls", async () => {
    const c = await signup("merge");
    complete.mockResolvedValueOnce(ok({ service: "Manicure" }));
    const first = await say(c, "manicure please");
    const sessionId = first.body.sessionId as string;

    // The model states only a time; the service from turn 1 must survive.
    complete.mockResolvedValueOnce(ok({ time: "10:00" }));
    await say(c, "at 10am", sessionId);

    const date = soon(7);
    complete.mockResolvedValueOnce(ok({ date }));
    const third = await say(c, `on ${date}`, sessionId);
    expect(third.body.draft.service).toBe("Manicure");
    expect(third.body.awaitingConfirmation).toBe(true);
  });

  it("records usage but never reasoning text", async () => {
    const c = await signup("usage");
    complete.mockResolvedValueOnce(ok({ service: "Haircut", date: soon(8), time: "09:00" }));
    const res = await say(c, "haircut on a weekday morning");
    const sessionId = res.body.sessionId as string;

    const rows = await pool.query(
      "SELECT meta FROM chat_messages WHERE session_id = $1 AND role = 'assistant'",
      [sessionId],
    );
    const meta = rows.rows[rows.rows.length - 1].meta as Record<string, unknown>;
    expect(meta.prompt_tokens).toBe(120);
    expect(meta.completion_tokens).toBe(30);
    expect(meta.reasoning_tokens).toBe(40);
    expect(meta.finish_reason).toBe("stop");
    expect(meta.latency_ms).toBe(900);
    // Reasoning is counted, never stored as text. The count is allowed; any
    // string field carrying the model's own prose is not.
    expect(Object.values(meta).every((v) => typeof v !== "string" || v.length < 200)).toBe(true);
  });
});

describe("chat: incomplete input", () => {
  it("asks for exactly the one missing field", async () => {
    const c = await signup("missing");
    complete.mockResolvedValueOnce(ok({ service: "Colour" }));
    const res = await say(c, "colour");
    expect(res.body.reply).toMatch(/^What date/i);
    expect(res.body.draft.time).toBeUndefined();

    complete.mockResolvedValueOnce(ok({ time: "11:00" }));
    const res2 = await say(c, "11am", res.body.sessionId);
    expect(res2.body.reply).toMatch(/^What date/i);
  });

  it("re-asks a date that is already past", async () => {
    const c = await signup("past");
    complete.mockResolvedValueOnce(ok({ service: "Haircut" }));
    const first = await say(c, "haircut");
    const sessionId = first.body.sessionId as string;

    complete.mockResolvedValueOnce(ok({ date: "2020-01-01", time: "10:00" }));
    const res = await say(c, "on the 1st of January 2020 at 10am", sessionId);
    expect(res.body.needsForm).toBe(true);
    expect(res.body.needsFormReason).toBe("invalid_time");
    expect(res.body.appointment).toBeNull();
    expect(res.body.status).toBe("active");
    // Nothing was written: a past time never becomes a stored instant.
    const session = await pool.query("SELECT draft FROM chat_sessions WHERE id = $1", [sessionId]);
    expect((session.rows[0].draft as { startsAtUtc?: string }).startsAtUtc).toBeUndefined();
  });
});

describe("chat: every AI failure falls back to the form", () => {
  const cases: [string, ReturnType<typeof fail>][] = [
    ["unparseable JSON", fail("ai_unparseable", "invalid JSON")],
    ["truncated (finish_reason length)", fail("ai_truncated", "truncated")],
    ["rate limited (429)", fail("ai_unavailable", "HTTP 429")],
    ["bad key (401)", fail("ai_unavailable", "HTTP 401")],
  ];

  for (const [index, [label, canned]] of cases.entries()) {
    it(`needsForm on ${label}, with a prefill from the draft`, async () => {
      const c = await signup(`f${index}`);
      // A draft already exists, so the fallback form can be pre-filled.
      complete.mockResolvedValueOnce(ok({ service: "Haircut" }));
      const first = await say(c, "haircut");
      const sessionId = first.body.sessionId as string;

      complete.mockResolvedValueOnce(canned);
      const res = await say(c, "sometime next week", sessionId);

      expect(res.status).toBe(200);
      expect(res.body.needsForm).toBe(true);
      expect(res.body.needsFormReason).toBeTruthy();
      expect(res.body.appointment).toBeNull();
      expect(res.body.status).toBe("active");
      // The collected field survives, so the form is not empty.
      expect(res.body.draft.service).toBe("Haircut");
    });
  }

  it("needsForm even with no draft at all", async () => {
    const c = await signup("nodraft");
    complete.mockResolvedValueOnce(fail("ai_unavailable", "HTTP 429"));
    const res = await say(c, "hello?");
    expect(res.body.needsForm).toBe(true);
    expect(res.body.draft).toEqual({});
  });
});

describe("chat: taken slot", () => {
  it("answers with a chat message and keeps the session active, not a 409", async () => {
    const c = await signup("taken");
    const date = soon(9);
    complete.mockResolvedValueOnce(ok({ service: "Haircut", date, time: "09:00" }));
    const res = await say(c, "haircut on that morning");
    const sessionId = res.body.sessionId as string;
    expect(res.body.awaitingConfirmation).toBe(true);

    // Somebody else takes the slot first, directly, so the exclusion
    // constraint is what the booking turn collides with. The instant MUST come
    // from the draft: 09:00 in Asia/Karachi is 04:00Z, so squatting "09:00Z"
    // would sit five hours away and the booking would correctly succeed.
    const bookedInstant = res.body.draft.startsAtUtc as string;
    expect(new Date(bookedInstant).toISOString()).toBe(bookedInstant);
    const squat = await pool.query(
      `INSERT INTO appointments (business_id, user_id, service, starts_at, duration_minutes, source)
       SELECT business_id, $2, 'Other', $3::timestamptz, 30, 'form'
        FROM users WHERE id = $1 RETURNING id`,
      [c.userId, c.userId, bookedInstant],
    );
    expect(squat.rows).toHaveLength(1);

    complete.mockClear();
    const yes = await say(c, "yes", sessionId);
    expect(complete).not.toHaveBeenCalled();
    expect(yes.status).toBe(200);
    expect(yes.body.appointment).toBeNull();
    expect(yes.body.status).toBe("active");
    expect(yes.body.reply).toMatch(/taken|another time/i);
    // The stale instant is cleared so the next turn must re-resolve a time.
    expect(yes.body.draft.startsAtUtc).toBeUndefined();

    // And the session can continue to a successful booking afterwards.
    complete.mockResolvedValueOnce(ok({ time: "11:00" }));
    const retry = await say(c, "how about 11am", sessionId);
    expect(retry.body.awaitingConfirmation).toBe(true);
    complete.mockClear();
    const booked = await say(c, "yes", sessionId);
    expect(booked.body.appointment).not.toBeNull();
    expect(booked.body.status).toBe("completed");
  });
});

describe("chat: flow control", () => {
  it("abandons on a plain no, without booking", async () => {
    const c = await signup("no");
    complete.mockResolvedValueOnce(ok({ service: "Haircut", date: soon(10), time: "09:00" }));
    const res = await say(c, "haircut");
    const sessionId = res.body.sessionId as string;

    complete.mockClear();
    const declined = await say(c, "no thanks", sessionId);
    expect(complete).not.toHaveBeenCalled();
    expect(declined.body.status).toBe("abandoned");
    expect(declined.body.appointment).toBeNull();

    const session = await pool.query("SELECT status FROM chat_sessions WHERE id = $1", [sessionId]);
    expect(session.rows[0].status).toBe("abandoned");
    const count = await pool.query(
      "SELECT count(*)::int AS n FROM appointments WHERE user_id = $1",
      [c.userId],
    );
    expect(count.rows[0].n).toBe(0);
  });

  it("refuses to start again on a finished session", async () => {
    const c = await signup("done");
    complete.mockResolvedValueOnce(ok({ service: "Haircut", date: soon(11), time: "09:00" }));
    const res = await say(c, "haircut");
    const sessionId = res.body.sessionId as string;
    await say(c, "no", sessionId);

    complete.mockClear();
    const again = await say(c, "haircut", sessionId);
    expect(complete).not.toHaveBeenCalled();
    expect(again.body.status).toBe("abandoned");
  });
});

describe("chat: authorization", () => {
  it("404s another user's session id", async () => {
    const owner = await signup("sowner");
    const intruder = await signup("sintruder");
    complete.mockResolvedValueOnce(ok({ service: "Haircut" }));
    const res = await say(owner, "haircut");
    const sessionId = res.body.sessionId as string;

    const get = await request(app)
      .get(`/api/chat/${sessionId}`)
      .set("authorization", `Bearer ${intruder.token}`)
      .set("x-forwarded-for", intruder.ip);
    expect(get.status).toBe(404);

    const abandon = await request(app)
      .post(`/api/chat/${sessionId}/cancel`)
      .set("authorization", `Bearer ${intruder.token}`)
      .set("x-forwarded-for", intruder.ip);
    expect(abandon.status).toBe(404);

    // The intruder's own session id does work, so the 404 above is isolation
    // and not a broken route.
    complete.mockResolvedValueOnce(ok({ service: "Colour" }));
    const own = await say(intruder, "colour");
    const ownGet = await request(app)
      .get(`/api/chat/${own.body.sessionId}`)
      .set("authorization", `Bearer ${intruder.token}`)
      .set("x-forwarded-for", intruder.ip);
    expect(ownGet.status).toBe(200);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/chat").send({ text: "hi" });
    expect(res.status).toBe(401);
  });

  it("rejects empty text and a malformed sessionId", async () => {
    const c = await signup("badin");
    expect((await say(c, "   ")).status).toBe(400);
    expect((await say(c, "hi", "not-a-uuid")).status).toBe(400);
  });
});
