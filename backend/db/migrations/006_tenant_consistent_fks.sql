-- Tenant-consistent foreign keys.
--
-- Why: `appointments.business_id` and `appointments.user_id` were two
-- independent foreign keys, so the database would happily store an appointment
-- whose business_id did not match its user_id. That is a cross-tenant write
-- and nothing below the application layer would catch it -- a bug in one
-- INSERT is enough, and the row then reads back as belonging to a user of a
-- different business. Verified before this migration: a direct INSERT with a
-- mismatched pair was accepted.
--
-- Fix: a composite unique key on users(id, business_id), then a composite FK
-- from appointments. A matching pair is now required, so the inconsistency is
-- unrepresentable rather than merely discouraged.
--
-- No BEGIN/COMMIT here: migrate.ts already wraps each file in a transaction,
-- and nesting one causes Postgres to warn and ignore the inner BEGIN while the
-- file's own COMMIT would close the outer transaction early -- leaving the
-- schema_migrations row to be written outside it.

-- Referenced columns must have a unique constraint to be the target of a
-- composite foreign key.
ALTER TABLE users
  ADD CONSTRAINT users_id_business_id_key UNIQUE (id, business_id);

ALTER TABLE appointments
  ADD CONSTRAINT appointments_user_business_fkey
  FOREIGN KEY (user_id, business_id)
  REFERENCES users (id, business_id)
  ON DELETE CASCADE;
