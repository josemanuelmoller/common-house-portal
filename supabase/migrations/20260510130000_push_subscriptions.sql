-- push_subscriptions — Web Push subscriptions per user/device (Fase 5)
--
-- Each row is one PushSubscription registered by the browser.
-- One user may have multiple rows (phone + laptop, etc).
-- Keyed by `endpoint` (UNIQUE) — the browser's push service URL.
--
-- RLS: enabled with no policies. Service-role bypass.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  -- Granular per-channel mute switches; default all on.
  notify_p1 boolean NOT NULL DEFAULT true,
  notify_decision boolean NOT NULL DEFAULT true,
  notify_deadline boolean NOT NULL DEFAULT true,
  notify_digest boolean NOT NULL DEFAULT true,
  -- Health
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  is_revoked boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id, is_revoked);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (uses set_updated_at function created in inbox_items migration)
DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
