-- Re-runnable demo data. Every insert is guarded by ON CONFLICT DO NOTHING,
-- which is satisfied by the unique indexes from 004/005.

-- pgcrypto's bcrypt output ($2a$) is accepted by the bcrypt npm package.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO businesses (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Salon')
ON CONFLICT (id) DO NOTHING;

-- Cost 10 here vs bcrypt npm's default 12: this hash verifies fine, it just
-- does slightly less work than a freshly created user would.
INSERT INTO users (business_id, email, password_hash, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo@example.com',
        crypt('Password123!', gen_salt('bf', 10)), 'Demo User')
ON CONFLICT DO NOTHING;

-- starts_at is computed in the database session timezone (UTC on Neon).
-- ON CONFLICT alone is NOT enough here: because starts_at is derived from
-- now(), re-running on a later day would produce a different instant, match no
-- existing unique key, and insert a duplicate. The NOT EXISTS guard makes the
-- seed re-runnable indefinitely by keying on (user, service) instead.
INSERT INTO appointments (business_id, user_id, service, starts_at, source)
SELECT '00000000-0000-0000-0000-000000000001', u.id, 'Haircut',
       date_trunc('day', now()) + interval '2 days 14 hours', 'form'
FROM users u
WHERE lower(u.email) = 'demo@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.user_id = u.id AND a.service = 'Haircut'
  );
