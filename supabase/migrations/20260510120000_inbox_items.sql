-- inbox_items — Quick Capture from Android PWA (Fase 2)
-- Stores notes / photos / voice memos captured via the PWA quick-capture screen
-- or the Android Share Target. Distinct from `inbox_ignores` (email triage table).
--
-- Lifecycle:
--   new        → just received, not yet seen by classifier
--   classifying → classifier in flight
--   classified  → agent set type/priority with confidence ≥ 70
--   needs_review → agent confidence < 70, awaiting human confirmation
--   pending_action → routed somewhere (reminder/task/etc) and waiting on action
--   done        → user marked complete
--   archived    → user dismissed / outdated
--
-- RLS: enabled with no policies. Server uses SUPABASE_SERVICE_KEY which bypasses RLS.

CREATE TABLE IF NOT EXISTS public.inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Capture source
  source text NOT NULL,
  client_capture_id text, -- client UUID for offline-queue dedup

  -- User input
  raw_text text,
  user_notes_to_agent text,
  user_type_override text,
  user_due_date date,

  -- Media (Supabase Storage paths in `inbox-captures` bucket; signed URLs at read time)
  photo_path text,
  audio_path text,

  -- Extracted by classifier (Fase 4)
  ocr_text text,
  transcript text,

  -- Agent classification (Fase 4)
  agent_type text,
  agent_priority text,
  agent_due_date date,
  agent_linked_org_id uuid,
  agent_linked_person_id uuid,
  agent_linked_project_id uuid,
  agent_confidence integer,
  agent_reasoning text,
  agent_classified_at timestamptz,

  -- Lifecycle
  status text NOT NULL DEFAULT 'new',

  -- Routing destination (Fase 4)
  routed_to_table text,
  routed_to_id uuid,
  routed_at timestamptz,

  -- Multi-user ready (single-user today; user_id is Clerk userId)
  user_id text,

  CONSTRAINT inbox_items_source_chk CHECK (
    source IN ('quick_capture', 'share_target', 'voice_capture')
  ),
  CONSTRAINT inbox_items_user_type_chk CHECK (
    user_type_override IS NULL OR user_type_override IN (
      'reminder', 'read-later', 'client-message', 'reference', 'idea', 'other'
    )
  ),
  CONSTRAINT inbox_items_agent_type_chk CHECK (
    agent_type IS NULL OR agent_type IN (
      'reminder', 'read-later', 'client-message', 'reference', 'idea', 'other'
    )
  ),
  CONSTRAINT inbox_items_agent_priority_chk CHECK (
    agent_priority IS NULL OR agent_priority IN ('P1', 'P2', 'P3')
  ),
  CONSTRAINT inbox_items_status_chk CHECK (
    status IN ('new', 'classifying', 'classified', 'needs_review', 'pending_action', 'done', 'archived')
  ),
  CONSTRAINT inbox_items_confidence_chk CHECK (
    agent_confidence IS NULL OR (agent_confidence >= 0 AND agent_confidence <= 100)
  ),
  CONSTRAINT inbox_items_has_content CHECK (
    raw_text IS NOT NULL OR photo_path IS NOT NULL OR audio_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS inbox_items_status_idx
  ON public.inbox_items (status, created_at DESC);

CREATE INDEX IF NOT EXISTS inbox_items_user_idx
  ON public.inbox_items (user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_items_client_dedup
  ON public.inbox_items (client_capture_id)
  WHERE client_capture_id IS NOT NULL;

ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;

-- updated_at auto-touch (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inbox_items_set_updated_at ON public.inbox_items;
CREATE TRIGGER inbox_items_set_updated_at
  BEFORE UPDATE ON public.inbox_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for photo + audio captures
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-captures',
  'inbox-captures',
  false,
  26214400, -- 25 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav',
    'audio/x-m4a', 'audio/aac'
  ]
)
ON CONFLICT (id) DO NOTHING;
