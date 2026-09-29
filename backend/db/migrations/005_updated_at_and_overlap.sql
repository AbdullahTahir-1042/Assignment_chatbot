-- 005: updated_at maintenance + true overlap guard

-- 1. updated_at was DEFAULT now() with no trigger, so every UPDATE (cancelling an
--    appointment, advancing a chat draft) silently left it stale. That breaks the
--    chat_sessions(user_id, updated_at DESC) index used to resume the latest session.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS appointments_set_updated_at ON appointments;
CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS chat_sessions_set_updated_at ON chat_sessions;
CREATE TRIGGER chat_sessions_set_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. The 004 partial unique index only blocks two rows with the *identical*
--    starts_at. A 09:00 60-min appointment and a 09:30 30-min one both slipped
--    through. btree_gist lets us exclude on the actual time range instead.
--
--    Note the AT TIME ZONE 'UTC': `timestamptz + interval` is only STABLE,
--    because the result depends on the session time zone, and exclusion
--    expressions must be IMMUTABLE. Converting to a bare `timestamp` first
--    makes both endpoints immutable. The stored instant is unchanged; only the
--    arithmetic is pinned to UTC.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Superseded by the stricter exclusion constraint below.
DROP INDEX IF EXISTS appointments_slot_uq;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    business_id WITH =,
    tsrange(
      (starts_at AT TIME ZONE 'UTC'),
      (starts_at AT TIME ZONE 'UTC') + make_interval(mins => duration_minutes)
    ) WITH &&
  )
  WHERE (status <> 'cancelled');
