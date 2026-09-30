import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { extractedFieldsSchema, EXTRACTION_PROMPT, type ExtractedFields } from "./chat.schema.js";

/**
 * The whole AI dependency, behind one function, so tests can mock it and never
 * touch the network. A single export is deliberate: every failure mode
 * (parse error, truncation, 401, 429) is then a canned return value in a test
 * rather than a real request against a 30/minute free tier.
 */
export type CompleteResult = {
  ok: true;
  fields: ExtractedFields;
  usage: AiUsage;
};

export type CompleteFailure = {
  ok: false;
  reason: "ai_unparseable" | "ai_truncated" | "ai_unavailable";
  detail: string;
  usage?: AiUsage;
};

export type CompleteInput = {
  system: string;
  user: string;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Usage keys are snake_case ON PURPOSE.
 *
 * Postgres `jsonb` lowercases every object key it stores, so
 * `{"reasoningTokens":40}` comes back as `{"reasoningtokens":40}`. Camel-casing
 * here would make what is written differ from what is read, which is exactly
 * how a field silently stops matching its consumer.
 */
export type AiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  /** Counted, never stored as text: not useful to a user, noise in an audit log. */
  reasoning_tokens: number;
  finish_reason: string;
  latency_ms: number;
};

/** 401/429/5xx and network faults are all "we could not reach a verdict". */
const isTransportFailure = (status: number): boolean =>
  status === 401 || status === 429 || status >= 500;

export const complete = async (input: CompleteInput): Promise<CompleteResult | CompleteFailure> => {
  const started = Date.now();
  const base = {
    model: env.AI_MODEL,
    temperature: 0,
    max_tokens: 1000,
    response_format: { type: "json_object" },
    // openai/gpt-oss-120b reasons before answering. Left on with low effort
    // because a 1000-token cap on a reasoning model truncates otherwise, and
    // the reasoning itself is discarded rather than stored.
    reasoning_effort: "low",
    include_reasoning: false,
  } as const;

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...base,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const latencyMs = Date.now() - started;
    logger.warn({ err, latencyMs }, "groq request failed");
    return {
      ok: false,
      reason: "ai_unavailable",
      detail: "network error",
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        reasoning_tokens: 0,
        finish_reason: "network_error",
        latency_ms: latencyMs,
      },
    };
  }

  if (!res.ok) {
    const latencyMs = Date.now() - started;
    const body = await res.text().catch(() => "");
    logger.warn({ status: res.status, latencyMs, body: body.slice(0, 200) }, "groq returned an error");
    return {
      ok: false,
      reason: isTransportFailure(res.status) ? "ai_unavailable" : "ai_unparseable",
      detail: `HTTP ${res.status}`,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        reasoning_tokens: 0,
        finish_reason: `http_${res.status}`,
        latency_ms: latencyMs,
      },
    };
  }

  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  } | null;

  const latencyMs = Date.now() - started;
  const choice = json?.choices?.[0];
  const finishReason = choice?.finish_reason ?? "unknown";
  const usage = {
    prompt_tokens: json?.usage?.prompt_tokens ?? 0,
    completion_tokens: json?.usage?.completion_tokens ?? 0,
    // Reasoning is counted, never kept: it is not useful to a user and is
    // noise in an audit log.
    reasoning_tokens: json?.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    finish_reason: finishReason,
    latency_ms: latencyMs,
  };

  if (finishReason === "length") {
    return { ok: false, reason: "ai_truncated", detail: "truncated", usage };
  }
  if (finishReason !== "stop") {
    return { ok: false, reason: "ai_unavailable", detail: `finish_reason=${finishReason}`, usage };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(choice?.message?.content ?? "");
  } catch {
    return { ok: false, reason: "ai_unparseable", detail: "invalid JSON", usage };
  }

  const fields = extractedFieldsSchema.safeParse(parsed);
  if (!fields.success) {
    return { ok: false, reason: "ai_unparseable", detail: "schema mismatch", usage };
  }

  return { ok: true, fields: fields.data, usage };
};

export const buildSystemPrompt = (input: {
  today: string;
  nowTime: string;
  timezone: string;
  weekday: string;
}): string =>
  `${EXTRACTION_PROMPT}

Current date and time in the user's timezone (${input.timezone}):
date=${input.today} time=${input.nowTime} weekday=${input.weekday}
Resolve "today", "tomorrow", "next Tuesday" against date= above, in ${input.timezone}.`;
