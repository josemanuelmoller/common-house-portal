-- Push notification snoozes.
-- When the user taps a "Snooze 1h / 3h / 24h" action on a Web Push notification,
-- the SW calls /api/push/action/snooze which writes a row here. The sendPush
-- helper checks this table before emitting and skips any tag that is currently
-- snoozed. Without this table the snooze action was a no-op (B-004 audit).

CREATE TABLE IF NOT EXISTS public.push_snoozes (
  tag             text         NOT NULL,
  user_id         text         NOT NULL,
  snoozed_until   timestamptz  NOT NULL,
  snoozed_at      timestamptz  NOT NULL DEFAULT now(),
  snoozed_by      text         NULL,
  PRIMARY KEY (tag, user_id)
);

CREATE INDEX IF NOT EXISTS push_snoozes_until_idx
  ON public.push_snoozes (snoozed_until);

COMMENT ON TABLE public.push_snoozes IS
  'Active snoozes for Web Push notifications. sendPush filters by (tag, user_id) '
  'and skips emission if snoozed_until > now(). Cleared by natural expiry.';
