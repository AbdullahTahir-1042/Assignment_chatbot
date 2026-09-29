-- The same cross-tenant hole as migration 006, applied to chat_sessions.
--
-- Phase 5 writes to this table, so the constraint has to exist before the
-- extractor does, not after a bug has been shipped. Done now rather than
-- deferred: adding a NOT VALID-free composite FK later requires a full table
-- scan and a lock, whereas here the table is empty.
--
-- No BEGIN/COMMIT, for the reason given in migration 006.

ALTER TABLE chat_sessions
  ADD CONSTRAINT chat_sessions_user_business_fkey
  FOREIGN KEY (user_id, business_id)
  REFERENCES users (id, business_id)
  ON DELETE CASCADE;
