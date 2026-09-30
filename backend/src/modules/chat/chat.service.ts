import type pg from "pg";
import { DateTime } from "luxon";
import { pool, withTransaction } from "../../config/db.js";
import { logger } from "../../shared/logger.js";
import { appointmentService } from "../appointments/appointments.service.js";
import { buildSystemPrompt, complete } from "./ai.client.js";
import {
  formatBooked,
  formatConfirmation,
  localNowForPrompt,
  missingBookingFields,
  resolveLocalToUtc,
} from "./ai.extractor.js";
import { chatRepository } from "./chat.repository.js";
import type { ChatReply, Draft, ExtractedFields, NeedsFormReason } from "./chat.schema.js";

type Tenant = { userId: string; businessId: string };

/**
 * The default zone. A real product would read this from the user's profile or
 * browser; here it is a constant so the tests are deterministic and the
 * conversion path is exercised end to end.
 */
const DEFAULT_TIMEZONE = "Asia/Karachi";

const DEFAULT_DURATION = 30;

/** Postgres SQLSTATE for the exclusion constraint. */
const EXCLUSION_VIOLATION = "23P01";

const DECLINE_REPLY = "No problem. Let me know when you're ready.";

/**
 * Whole-message only, and only consulted while a session is confirming.
 *
 * These are deliberately not /\b/-anchored. A user typing "no, make it 5pm
 * instead" or "cancel that, do 3pm" is correcting a booking, not declining it,
 * and an unanchored prefix match would abandon a live session mid-negotiation.
 * Anything longer than the bare word falls through to the extractor, which is
 * where corrections belong.
 */
const DECLINE =
  /^(no|nope|nah|no thanks|thanks no|never ?mind|nevermind|cancel|stop|forget it)[.!]?$/;
const AFFIRM = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|book it|do it|go ahead)[.!]?$/;

/**
 * An IANA zone from the client, or null. The browser sends `Intl
 * .DateTimeFormat().resolvedOptions().timeZone`, which is why the frontend
 * passes it: without it every user gets the server's zone and the demo shows
 * an interviewer in another country the wrong time.
 *
 * Validated through Intl rather than trusted, because a bad zone reaching
 * resolveLocalToUtc would be rejected there and strand the turn.
 */
const resolveTimezone = (tz: string | undefined): string | undefined => {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    logger.warn({ tz }, "rejecting unknown IANA timezone from client");
    return undefined;
  }
};

const isSlotTaken = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && err.code === EXCLUSION_VIOLATION;

const prefill = (draft: Draft): Record<string, string | number | undefined> => ({
  ...(draft.service ? { service: draft.service } : {}),
  ...(draft.date ? { date: draft.date } : {}),
  ...(draft.time ? { time: draft.time } : {}),
  ...(draft.durationMinutes ? { durationMinutes: draft.durationMinutes } : {}),
});

/**
 * Merges what the model returned into the stored draft.
 *
 * The model only ever supplies fields, never a final object, and null means
 * "not stated yet" -- so a null must NOT erase something already collected.
 * Overwriting with nulls is how a two-turn booking loses its first field.
 */
const mergeDraft = (draft: Draft, fields: ExtractedFields): Draft => {
  const next: Draft = { ...draft };
  if (fields.service) next.service = fields.service;
  if (fields.date) next.date = fields.date;
  if (fields.time) next.time = fields.time;
  if (typeof fields.durationMinutes === "number") next.durationMinutes = fields.durationMinutes;
  return next;
};

const base = (
  sessionId: string,
  status: ChatReply["status"],
  reply: string,
  draft: Draft,
): ChatReply => ({
  sessionId,
  status,
  reply,
  draft,
  needsForm: false,
  needsFormReason: null,
  awaitingConfirmation: false,
  appointment: null,
});

/**
 * The prompt: the draft, the recent turns, the current local date, and the
 * message the user just sent.
 *
 * The newest message is passed in explicitly rather than read from history.
 * History is fetched BEFORE the current message is persisted, so on the first
 * turn it is empty and the model would be asked to extract from a conversation
 * that does not contain what the user actually said -- and it would helpfully
 * return nulls for a request it never saw.
 */
const buildUserPrompt = (
  draft: Draft,
  history: { role: string; content: string }[],
  currentText: string,
): string => {
  // Only the fields the model is allowed to return. startsAtUtc and timezone
  // are derived state; listing them as "collected" invites it to echo them.
  const collected = (["service", "date", "time", "durationMinutes"] as const)
    .filter((key) => draft[key] !== undefined)
    .map((key) => `${key}=${String(draft[key])}`)
    .join(" ");
  const lines = history.map((m) => `${m.role}: ${m.content}`);
  return [
    collected ? `Already collected: ${collected}` : "Already collected: nothing yet",
    ...(lines.length ? ["Recent conversation:", ...lines] : []),
    `Newest user message: ${currentText}`,
    "Extract only what the newest user message states.",
  ].join("\n");
};

/** Whether the wall-clock the model produced is already behind us. */
const isInThePast = (date: string, time: string, timezone: string): boolean => {
  const local = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  return local.isValid && local.toUTC() < DateTime.utc();
};

const fieldQuestion = (field: string): string => {
  switch (field) {
    case "service":
      return "Which service would you like? For example: Haircut, Manicure, Colour.";
    case "date":
      return "What date would you like?";
    case "time":
      return "What time works for you?";
    default:
      return "Could you tell me a bit more?";
  }
};

export const chatService = {
  /** A user declining to continue ends the session without booking. */
  async abandon(tenant: Tenant, sessionId: string): Promise<ChatReply> {
    const session = await chatRepository.requireSession(pool, sessionId, tenant);
    const done = await chatRepository.abandonSession(pool, session.id);
    return {
      ...base(session.id, "abandoned", "No problem. Let me know when you're ready.", session.draft),
      status: done.status,
    };
  },

  /**
   * One chat turn. Order of decisions, in order:
   *   1. Is the session real and still active? (no AI call)
   *   2. Did the user just answer yes to a confirmation? (book, no AI call)
   *   3. Did the user say no? (abandon, no AI call)
   *   4. Otherwise: extract, then decide what to say.
   *
   * Steps 2 and 3 deliberately never call the model. "yes" is not a booking
   * instruction to parse, and routing it through an LLM would make the one
   * decision that matters depend on a probabilistic call.
   */
  async message(
    tenant: Tenant,
    input: { sessionId?: string | undefined; text: string; timezone?: string | undefined },
  ): Promise<ChatReply> {
    const session = input.sessionId
      ? await chatRepository.requireSession(pool, input.sessionId, tenant)
      : await chatRepository.createSession(pool, tenant);

    if (session.status !== "active") {
      return base(
        session.id,
        session.status,
        "This booking is already finished. Start a new message to book again.",
        session.draft,
      );
    }

    const timezone = resolveTimezone(input.timezone) ?? session.draft.timezone ?? DEFAULT_TIMEZONE;
    const text = input.text.trim();
    const lower = text.toLowerCase();

    // A session is only "confirming" when it holds a resolved instant to
    // confirm. Both yes and no are anchored to the WHOLE message and only
    // apply in that state.
    //
    // Without the anchors, "no, make it 5pm instead" abandons a live booking
    // and "ok but shift to Friday" books the wrong time -- `\b` matches after
    // "no" because a comma or space follows. In any other state a "no" is
    // ordinary input and belongs to the extractor.
    const wasConfirming = session.draft.startsAtUtc !== undefined;

    // --- 3. a whole-message decline ends the flow ---------------------------
    if (wasConfirming && DECLINE.test(lower)) {
      const done = await chatRepository.abandonSession(pool, session.id);
      const saved = await chatRepository.addMessage(pool, {
        sessionId: session.id,
        role: "user",
        content: text,
      });
      await chatRepository.addMessage(pool, {
        sessionId: session.id,
        role: "assistant",
        content: DECLINE_REPLY,
        meta: { kind: "abandoned" },
      });
      logger.info({ sessionId: session.id, userMessageId: saved.id }, "chat abandoned by user");
      return {
        ...base(session.id, "abandoned", DECLINE_REPLY, session.draft),
        status: done.status,
      };
    }

    // --- 2. a whole-message "yes" books, inside one transaction -------------
    if (wasConfirming && AFFIRM.test(lower)) {
      return chatService.confirm(tenant, session, text);
    }

    if (wasConfirming) {
      // Something else: treat it as more information rather than booking.
      logger.debug({ sessionId: session.id }, "confirmation turn received a non-yes reply");
    }

    // --- 4. extract ---------------------------------------------------------
    const now = localNowForPrompt(timezone);
    const history = await chatRepository.recentMessages(pool, session.id);
    const started = Date.now();
    const result = await complete({
      system: buildSystemPrompt({
        today: now.date,
        nowTime: now.time,
        timezone,
        weekday: DateTime.fromISO(`${now.date}T12:00:00`, { zone: timezone }).toFormat("cccc"),
      }),
      user: buildUserPrompt(session.draft, history, text),
    });

    await chatRepository.addMessage(pool, { sessionId: session.id, role: "user", content: text });

    // Every AI failure lands on the fallback form. A booking flow that dead-ends
    // on a 429 is worse than one that quietly offers a form.
    if (!result.ok) {
      const reason = result.reason as NeedsFormReason;
      const reply =
        reason === "ai_truncated"
          ? "I didn't quite catch that. You can book directly with the form below."
          : "I can't reach the booking assistant right now. You can book with the form below.";
      const saved = await chatRepository.addMessage(pool, {
        sessionId: session.id,
        role: "assistant",
        content: reply,
        meta: {
          ...result.usage,
          kind: "needs_form",
          reason,
          detail: result.detail,
          ...(result.usage ? { totalMs: Date.now() - started } : {}),
        },
      });
      logger.warn({ sessionId: saved.sessionId, reason, detail: result.detail }, "ai failure, offering form");
      return {
        ...base(session.id, "active", reply, session.draft),
        needsForm: true,
        needsFormReason: reason,
      };
    }

    const merged = mergeDraft(session.draft, result.fields);
    const missing = missingBookingFields(merged);

    if (missing.length > 0) {
      // Exactly one question, for the first missing field. Asking for all three
      // at once is how a user answers "haircut, tuesday" and nothing gets
      // resolved.
      const question = fieldQuestion(missing[0]!);
      const saved = await chatRepository.saveDraft(pool, session.id, merged);
      await chatRepository.addMessage(pool, {
        sessionId: session.id,
        role: "assistant",
        content: question,
        meta: { ...result.usage, kind: "asking", missing },
      });
      return base(session.id, "active", question, saved.draft);
    }

    // All fields present. Resolve to a UTC instant; a null here means the time
    // cannot exist (DST gap) or is already past.
    const startsAt = resolveLocalToUtc({
      date: merged.date!,
      time: merged.time!,
      timezone,
    });
    if (!startsAt) {
      // date AND time are both cleared, and needsForm stays false.
      //
      // Keeping them would strand the session: the next message merges into a
      // draft that still holds the unresolvable pair and fails identically, so
      // the user is asked the same question forever. Clearing both lets one
      // corrected value ("3pm on Friday") rebuild the pair.
      //
      // This is also not a needsForm case -- the user did nothing wrong and only
      // needs to pick another time. The fallback form is for AI failures.
      const kept: Draft = { service: merged.service, timezone };
      const question = isInThePast(merged.date!, merged.time!, timezone)
        ? "That time has already passed. What date and time would suit you instead?"
        : "I couldn't read that date and time. Could you give me another?";
      const saved = await chatRepository.saveDraft(pool, session.id, kept);
      await chatRepository.addMessage(pool, {
        sessionId: session.id,
        role: "assistant",
        content: question,
        meta: { ...result.usage, kind: "invalid_time" },
      });
      return base(session.id, "active", question, saved.draft);
    }

    const ready: Draft = {
      ...merged,
      startsAtUtc: startsAt.toISOString(),
      timezone,
      durationMinutes: merged.durationMinutes ?? DEFAULT_DURATION,
    };
    const saved = await chatRepository.saveDraft(pool, session.id, ready);
    const confirmText = formatConfirmation({
      service: ready.service!,
      startsAt,
      timezone,
    });
    await chatRepository.addMessage(pool, {
      sessionId: session.id,
      role: "assistant",
      content: confirmText,
      meta: { ...result.usage, kind: "confirming" },
    });
    return {
      ...base(session.id, "active", confirmText, saved.draft),
      awaitingConfirmation: true,
    };
  },

  /**
   * The booking turn. Insert, session completion and both message saves happen
   * in one transaction, so a crash cannot leave an appointment with no
   * conversation record, or a completed session with no appointment.
   *
   * A taken slot is NOT a 409 to the chat UI. The constraint is caught here and
   * answered with another prompt, leaving the session active and the draft
   * intact, because from the user's point of view the booking simply is not
   * available yet.
   */
  async confirm(
    tenant: Tenant,
    session: { id: string; draft: Draft },
    confirmationText: string,
  ): Promise<ChatReply> {
    const { draft } = session;
    if (!draft.startsAtUtc || !draft.service) {
      return base(
        session.id,
        "active",
        "I still need a service and a time before I can book that.",
        draft,
      );
    }
    const startsAt = new Date(draft.startsAtUtc);

    try {
      const appointment = await withTransaction(async (client: pg.PoolClient) => {
        // The user's own "yes" is part of the conversation, so it is saved
        // alongside the booking. Resuming the session later has to show what
        // they agreed to, not a confirmation question with no answer after it.
        await chatRepository.addMessage(client, {
          sessionId: session.id,
          role: "user",
          content: confirmationText,
          meta: { kind: "confirmation" },
        });
        const created = await appointmentService.create(
          client,
          tenant,
          {
            service: draft.service!,
            startsAt: draft.startsAtUtc!,
            durationMinutes: draft.durationMinutes ?? DEFAULT_DURATION,
          },
          "chat",
        );
        await chatRepository.addMessage(client, {
          sessionId: session.id,
          role: "assistant",
          content: formatBooked({
            service: draft.service!,
            startsAt,
            timezone: draft.timezone ?? DEFAULT_TIMEZONE,
          }),
          meta: { kind: "booked", appointmentId: created.id },
        });
        await chatRepository.completeSession(client, session.id);
        return created;
      });

      return {
        ...base(session.id, "completed", `Booked: ${draft.service}.`, { ...draft }),
        status: "completed",
        appointment: {
          id: appointment.id,
          service: appointment.service,
          startsAt: appointment.startsAt,
          durationMinutes: appointment.durationMinutes,
        },
      };
    } catch (err) {
      if (isSlotTaken(err)) {
        // Drop the confirmed instant so the next turn must re-resolve a time.
        await chatRepository.saveDraft(pool, session.id, { ...draft, startsAtUtc: undefined });
        // Nothing was booked, so this is not the transactional turn, but the
        // user's "yes" still happened and belongs in the transcript.
        await chatRepository.addMessage(pool, {
          sessionId: session.id,
          role: "user",
          content: confirmationText,
          meta: { kind: "confirmation" },
        });
        const reply = "That time has just been taken. What other time works for you?";
        await chatRepository.addMessage(pool, {
          sessionId: session.id,
          role: "assistant",
          content: reply,
          meta: { kind: "slot_taken" },
        });
        return {
          ...base(session.id, "active", reply, { ...draft, startsAtUtc: undefined }),
          awaitingConfirmation: false,
        };
      }
      logger.error({ err, sessionId: session.id }, "chat booking failed");
      throw err;
    }
  },

  async history(tenant: Tenant, sessionId: string) {
    const session = await chatRepository.requireSession(pool, sessionId, tenant);
    const messages = await chatRepository.recentMessages(pool, session.id, 100);
    return { session, messages };
  },
};

export const __prefillForTest = prefill;
