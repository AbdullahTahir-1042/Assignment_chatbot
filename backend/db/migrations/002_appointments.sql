-- 002: appointments

CREATE TABLE IF NOT EXISTS appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service          text NOT NULL,
  starts_at        timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
  status           text NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  source           text NOT NULL DEFAULT 'form' CHECK (source IN ('chat', 'form')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
