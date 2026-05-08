-- Documents the existing `knowledge_nodes`, `knowledge_node_changelog`, and
-- `knowledge_node_citations` schema in production.
--
-- These tables predate the Phase 1 migrations (the original DDL lived in
-- `replace_playbooks_with_knowledge_nodes`, applied directly to prod and never
-- checked into the repo). The Phase 1 migrations reference them in FKs and
-- RLS policies but do not define them, which broke fresh-environment
-- reproduction (a `supabase db reset` would fail before reaching Phase 1).
--
-- This migration uses `IF NOT EXISTS` everywhere so it is a no-op on prod
-- (where the tables already exist) and a working bootstrap on a fresh
-- environment (CI, local dev). It MUST run BEFORE the Phase 1 migrations,
-- which is guaranteed by its earlier filename timestamp ordering only if
-- applied to a fresh DB; on prod the order does not matter because the
-- tables already exist.

-- ─── knowledge_nodes ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_nodes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path                   text NOT NULL UNIQUE,
  slug                   text NOT NULL,
  parent_id              uuid REFERENCES public.knowledge_nodes(id) ON DELETE SET NULL,
  depth                  integer NOT NULL DEFAULT 0,
  title                  text NOT NULL,
  summary                text NOT NULL DEFAULT '',
  body_md                text NOT NULL DEFAULT '',
  tags                   text[] NOT NULL DEFAULT '{}',
  facets                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_axes           text[] NOT NULL DEFAULT '{}',
  status                 text NOT NULL DEFAULT 'Active'
                         CHECK (status IN ('Active','Stale','Archived')),
  reference_count        integer NOT NULL DEFAULT 0,
  last_evidence_at       timestamptz,
  last_reviewed_at       timestamptz,
  playbook_md            text,
  playbook_generated_at  timestamptz,
  playbook_source_count  integer,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_nodes_path_idx   ON public.knowledge_nodes (path);
CREATE INDEX IF NOT EXISTS knowledge_nodes_parent_idx ON public.knowledge_nodes (parent_id);
CREATE INDEX IF NOT EXISTS knowledge_nodes_facets_idx ON public.knowledge_nodes USING GIN (facets);

-- ─── knowledge_node_changelog ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_node_changelog (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             uuid NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  evidence_notion_id  text,
  action              text NOT NULL
                      CHECK (action IN ('CREATED','APPEND','AMEND','SPLIT','IGNORE')),
  section             text,
  diff_before         text,
  diff_after          text,
  reasoning           text NOT NULL,
  status              text NOT NULL DEFAULT 'applied'
                      CHECK (status IN ('applied','proposed','rejected')),
  applied_by          text NOT NULL DEFAULT 'agent:knowledge-curator',
  created_at          timestamptz NOT NULL DEFAULT now(),
  applied_at          timestamptz
);

CREATE INDEX IF NOT EXISTS knowledge_node_changelog_node_idx
  ON public.knowledge_node_changelog (node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_node_changelog_evidence_idx
  ON public.knowledge_node_changelog (evidence_notion_id);

-- ─── knowledge_node_citations ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_node_citations (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id   uuid NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  cited_by  text NOT NULL,
  cited_at  timestamptz NOT NULL DEFAULT now(),
  context   text
);

CREATE INDEX IF NOT EXISTS knowledge_node_citations_node_idx
  ON public.knowledge_node_citations (node_id, cited_at DESC);

-- ─── Triggers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.knowledge_node_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_node_touch_trig ON public.knowledge_nodes;
CREATE TRIGGER knowledge_node_touch_trig
BEFORE UPDATE ON public.knowledge_nodes
FOR EACH ROW
EXECUTE FUNCTION public.knowledge_node_touch_updated_at();

CREATE OR REPLACE FUNCTION public.knowledge_node_increment_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  UPDATE public.knowledge_nodes
     SET reference_count = reference_count + 1
   WHERE id = new.node_id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_node_citations_trig ON public.knowledge_node_citations;
CREATE TRIGGER knowledge_node_citations_trig
AFTER INSERT ON public.knowledge_node_citations
FOR EACH ROW
EXECUTE FUNCTION public.knowledge_node_increment_ref();
