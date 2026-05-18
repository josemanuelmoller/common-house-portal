-- Diagnostic table for capturing full error stacks from server components.
-- Vercel runtime logs truncate to ~240 chars; Supabase has no such limit.
-- Written by /api/debug-log; read by humans via SQL.
-- Intended for short-lived debug sessions; safe to truncate periodically.

CREATE TABLE IF NOT EXISTS public.debug_log (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz   NOT NULL DEFAULT now(),
  source      text          NOT NULL,
  user_email  text          NULL,
  url         text          NULL,
  message     text          NULL,
  stack       text          NULL,
  digest      text          NULL,
  metadata    jsonb         NULL
);

CREATE INDEX IF NOT EXISTS debug_log_occurred_at_idx
  ON public.debug_log (occurred_at DESC);

COMMENT ON TABLE public.debug_log IS
  'Full server-side error stacks captured from error.tsx boundaries. '
  'Vercel logs truncate to 240 chars; this table does not.';
