-- 008: distinct created_at for messages written in the same transaction
--
-- now() is the TRANSACTION start time, not the statement time. Every message
-- saved by one chat turn -- and the booking turn writes two inside a single
-- withTransaction -- therefore got an identical created_at, so the (created_at,
-- id) ordering that recentMessages relies on fell through to a random uuid
-- tie-break. The transcript could come back with the assistant's "Booked ..."
-- above the user's "yes" that authorised it.
--
-- clock_timestamp() advances within a transaction, so successive inserts are
-- ordered by when they actually happened. Existing rows keep their values; they
-- are already written in their real order and nothing re-reads them as a pair.
--
-- This is a data correction, not a schema change: only the column default moves.

ALTER TABLE chat_messages
  ALTER COLUMN created_at SET DEFAULT clock_timestamp();
