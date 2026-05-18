-- Permanent server-side dismissals for Ready-For-Jose draft cards.
-- Replaces the previous localStorage-only mechanism (24h TTL) so a dismiss
-- on one device sticks across browsers and never resurfaces (B-005 audit).
-- Resurrection requires the underlying draft to change status server-side
-- (e.g. from Approved → Sent), which produces a different row identity.

CREATE TABLE IF NOT EXISTS public.hall_draft_dismissals (
  draft_notion_id  text         NOT NULL,
  user_id          text         NOT NULL,
  dismissed_at     timestamptz  NOT NULL DEFAULT now(),
  dismissed_by     text         NULL,
  PRIMARY KEY (draft_notion_id, user_id)
);

CREATE INDEX IF NOT EXISTS hall_draft_dismissals_user_idx
  ON public.hall_draft_dismissals (user_id);

COMMENT ON TABLE public.hall_draft_dismissals IS
  'Per-user permanent dismissals for Ready-For-Jose draft cards. Filtered '
  'server-side at admin/page.tsx render time before passing to ReadyForJoseSection.';
