-- 004: indexes

-- Login lookup, case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

-- "My appointments", newest first. Leading column also serves the
-- ON DELETE CASCADE scan from users.
CREATE INDEX IF NOT EXISTS appointments_user_starts_idx
  ON appointments (user_id, starts_at DESC);

-- Double-booking guard (cancelled slots become reusable).
-- NOTE: exact-start-time only -- see 005 for the real overlap guard.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_uq
  ON appointments (business_id, starts_at)
  WHERE status <> 'cancelled';

-- Resume the latest active session
CREATE INDEX IF NOT EXISTS chat_sessions_user_updated_idx
  ON chat_sessions (user_id, updated_at DESC);

-- Load history in order
CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON chat_messages (session_id, created_at);
