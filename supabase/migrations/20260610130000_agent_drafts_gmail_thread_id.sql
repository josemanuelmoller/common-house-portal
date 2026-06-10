-- Inbox ↔ drafts cross-view, canonical edition.
--
-- The "does this thread have a draft?" join used notion_agent_drafts
-- (mirror), whose write path (notion-mirror-push) was no-op'd 2026-05-05 —
-- the join has matched zero rows ever since. gmail_thread_id moves to the
-- canonical agent_drafts table; nudge-draft and the inbox cross-views now
-- read/write it here.

ALTER TABLE public.agent_drafts
  ADD COLUMN IF NOT EXISTS gmail_thread_id text;

CREATE INDEX IF NOT EXISTS idx_agent_drafts_gmail_thread
  ON public.agent_drafts (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;
