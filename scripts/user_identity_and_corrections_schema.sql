-- ============================================================
-- User Identity + Per-Contact Corrections — Supabase DDL
--
-- Ships two AI-grounding mechanisms:
--
-- 1. Capa 2 — `user_identity`
--    Per-user context (name, aliases, owned organisations) injected
--    into every contact-intelligence prompt. Prevents Haiku from
--    attributing the user's own company to another contact.
--
--    The table was created earlier with a text[] user_own_orgs column;
--    we upgrade it to JSONB so each org can carry role/stake/notes.
--    It's empty (0 rows), so the ALTER is safe.
--
-- 2. Capa 3 — `people.corrections` JSONB
--    Per-contact ledger of user-verified fixes. Every "This is wrong"
--    click on an AI output lands here and is injected into future
--    prompts for that contact.
--
-- Run in the Supabase SQL editor for project rjcsasbaxihaubkkkxrt,
-- or via Supabase MCP `apply_migration`.
-- ============================================================

-- ── user_identity (upgrade existing table) ───────────────────────────────────

-- Ensure user_email is unique so we can upsert on it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_identity'::regclass
      AND conname  = 'user_identity_user_email_key'
  ) THEN
    ALTER TABLE public.user_identity
      ADD CONSTRAINT user_identity_user_email_key UNIQUE (user_email);
  END IF;
END$$;

-- Swap user_own_orgs from text[] to jsonb. Safe: table has 0 rows today.
ALTER TABLE public.user_identity
  DROP COLUMN IF EXISTS user_own_orgs;

ALTER TABLE public.user_identity
  ADD COLUMN IF NOT EXISTS user_own_orgs JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Separate field for self role classes (e.g. 'Team'). user_role_context
-- remains as free-form "additional context" prose.
ALTER TABLE public.user_identity
  ADD COLUMN IF NOT EXISTS user_role_classes TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.user_identity.user_own_orgs IS
  'JSONB array of user-owned organisations: [{name, role?, stake?, notes?}]. Prompts instruct the model never to attribute these to a contact unless evidence explicitly supports it.';

COMMENT ON COLUMN public.user_identity.user_role_classes IS
  'Self-applied relationship classes (Team, Partner, etc.) — parallel to people.relationship_classes.';

-- Seed a row for the primary admin if the table is empty.
INSERT INTO public.user_identity (user_email, user_name, user_aliases, user_own_orgs, user_role_context)
SELECT
  'josemanuel@wearecommonhouse.com',
  'José Manuel Moller',
  ARRAY['Jose','JM','Cote','José','Jose Manuel','JMM'],
  '[
     {"name":"Common House","role":"Co-founder","stake":"33.3%"},
     {"name":"Moller Upstream Consultancy","role":"Founder","stake":"100%","notes":"Personal consultancy of the user — NOT linked to other contacts unless they are employees of this entity."}
   ]'::jsonb,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.user_identity);

-- ── people.corrections ───────────────────────────────────────────────────────

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS corrections JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.people.corrections IS
  'User-verified fix ledger. Each entry: {id, scope, what_is_wrong, what_is_correct, created_at, created_by}. Injected into AI prompts to prevent repeated mistakes for this specific contact.';
