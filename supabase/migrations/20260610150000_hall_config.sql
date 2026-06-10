-- hall_config — central key/value store for operator-tunable identity and
-- behaviour that previously lived as hardcoded literals in route files
-- (founder-owned track patterns, default timezone, future self-name regexes).
-- One row per key; value is jsonb so lists and scalars share the table.

CREATE TABLE IF NOT EXISTS public.hall_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.hall_config ENABLE ROW LEVEL SECURITY;
-- Service-role only (server reads); no anon policies.

INSERT INTO public.hall_config (key, value) VALUES
  ('founder_owned_patterns', '["\\bcop\\s*31\\b", "zero\\s*waste\\s*forum", "\\bzwf\\b", "zero\\s*waste\\s*districts?", "china\\s*zero\\s*waste", "egypt.*reuse|reuse.*egypt", "reuse\\s*for\\s*all"]'::jsonb),
  ('default_timezone', '"Europe/London"'::jsonb)
ON CONFLICT (key) DO NOTHING;
