import type pg from "pg";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { draftSchema, type Draft } from "./chat.schema.js";

export type ChatSession = {
  id: string;
  userId: string;
  businessId: string;
  status: "active" | "completed" | "abandoned";
  draft: Draft;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

type Row = {
  id: string;
  user_id: string;
  business_id: string;
  status: ChatSession["status"];
  draft: unknown;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: ChatMessage["role"];
  content: string;
  meta: unknown;
  created_at: Date;
};

/** A draft that does not validate is treated as absent, never as a booking. */
const readDraft = (raw: unknown): Draft => {
  const parsed = draftSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
};

const toSession = (row: Row): ChatSession => ({
  id: row.id,
  userId: row.user_id,
  businessId: row.business_id,
  status: row.status,
  draft: readDraft(row.draft),
});

const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  sessionId: row.session_id,
  role: row.role,
  content: row.content,
  meta: (row.meta ?? {}) as Record<string, unknown>,
  createdAt: row.created_at.toISOString(),
});

const SESSION_COLUMNS = "id, user_id, business_id, status, draft";

export const chatRepository = {
  /**
   * Scoped by user_id AND business_id, and returns undefined rather than
   * throwing, so "someone else's session id" is indistinguishable from "no such
   * session" -- a 403 would confirm the id exists.
   */
  async findSession(
    db: pg.Pool | pg.PoolClient,
    sessionId: string,
    tenant: { userId: string; businessId: string },
  ): Promise<ChatSession | null> {
    const { rows } = await db.query<Row>(
      `SELECT ${SESSION_COLUMNS} FROM chat_sessions
        WHERE id = $1 AND user_id = $2 AND business_id = $3`,
      [sessionId, tenant.userId, tenant.businessId],
    );
    const row = rows[0];
    return row ? toSession(row) : null;
  },

  async requireSession(
    db: pg.Pool | pg.PoolClient,
    sessionId: string,
    tenant: { userId: string; businessId: string },
  ): Promise<ChatSession> {
    const session = await chatRepository.findSession(db, sessionId, tenant);
    if (!session) throw new NotFoundError("Chat session not found");
    return session;
  },

  async createSession(
    db: pg.Pool | pg.PoolClient,
    tenant: { userId: string; businessId: string },
    draft: Draft = {},
  ): Promise<ChatSession> {
    const { rows } = await db.query<Row>(
      `INSERT INTO chat_sessions (user_id, business_id, draft)
       VALUES ($1, $2, $3::jsonb)
       RETURNING ${SESSION_COLUMNS}`,
      [tenant.userId, tenant.businessId, JSON.stringify(draft)],
    );
    return toSession(rows[0]!);
  },

  async addMessage(
    db: pg.Pool | pg.PoolClient,
    input: { sessionId: string; role: ChatMessage["role"]; content: string; meta?: Record<string, unknown> },
  ): Promise<ChatMessage> {
    const { rows } = await db.query<MessageRow>(
      `INSERT INTO chat_messages (session_id, role, content, meta)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, session_id, role, content, meta, created_at`,
      [input.sessionId, input.role, input.content, JSON.stringify(input.meta ?? {})],
    );
    return toMessage(rows[0]!);
  },

  /**
   * Bounded history. The model gets the draft plus the last few messages, not
   * the whole conversation: token cost stays flat as a session grows, and the
   * draft is what actually carries the booking state forward.
   */
  async recentMessages(
    db: pg.Pool | pg.PoolClient,
    sessionId: string,
    limit = 6,
  ): Promise<ChatMessage[]> {
    const { rows } = await db.query<MessageRow>(
      `SELECT id, session_id, role, content, meta, created_at
         FROM chat_messages
        WHERE session_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [sessionId, limit],
    );
    return rows.map(toMessage).reverse();
  },

  async saveDraft(
    db: pg.Pool | pg.PoolClient,
    sessionId: string,
    draft: Draft,
  ): Promise<ChatSession> {
    const { rows } = await db.query<Row>(
      `UPDATE chat_sessions SET draft = $2::jsonb, updated_at = now()
        WHERE id = $1
        RETURNING ${SESSION_COLUMNS}`,
      [sessionId, JSON.stringify(draft)],
    );
    return toSession(rows[0]!);
  },

  async completeSession(
    db: pg.Pool | pg.PoolClient,
    sessionId: string,
  ): Promise<ChatSession> {
    const { rows } = await db.query<Row>(
      `UPDATE chat_sessions SET status = 'completed', updated_at = now()
        WHERE id = $1
        RETURNING ${SESSION_COLUMNS}`,
      [sessionId],
    );
    return toSession(rows[0]!);
  },

  async abandonSession(
    db: pg.Pool | pg.PoolClient,
    sessionId: string,
  ): Promise<ChatSession> {
    const { rows } = await db.query<Row>(
      `UPDATE chat_sessions SET status = 'abandoned', updated_at = now()
        WHERE id = $1
        RETURNING ${SESSION_COLUMNS}`,
      [sessionId],
    );
    return toSession(rows[0]!);
  },
};
