-- Phase 1.2 — Create 18 new canonical tables
-- See docs/SUPABASE_CONSOLIDATION_FREEZE.md §3
-- Each table has notion_id (current OS v2 backref) + legacy_notion_id (deprecated DBs).
-- Phase 2 backfill populates these. Phase 4 switches portal/agents to read from them.
-- Phase 6 drops the matching notion_* mirror tables.

-- ─── decision_items (replaces notion_decision_items mirror) ──────────────────
CREATE TABLE IF NOT EXISTS public.decision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  decision_type text,
  priority text,
  status text,
  source_agent text,
  requires_execute boolean NOT NULL DEFAULT false,
  execute_approved boolean NOT NULL DEFAULT false,
  due_date date,
  notes_raw text,
  notion_url text,
  category text,
  -- relations
  org_notion_id text,
  project_notion_id text,
  evidence_notion_id text,
  -- audit
  approved_at timestamptz,
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  -- timestamps
  notion_created_at timestamptz,
  last_edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decision_items_legacy_notion_id ON public.decision_items(legacy_notion_id) WHERE legacy_notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decision_items_status ON public.decision_items(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decision_items_org ON public.decision_items(org_notion_id) WHERE org_notion_id IS NOT NULL;

-- ─── knowledge_assets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  asset_type text,
  status text,
  body_md text,
  summary text,
  knowledge_node_id uuid REFERENCES public.knowledge_nodes(id) ON DELETE SET NULL,
  evidence_count integer NOT NULL DEFAULT 0,
  last_evidence_at timestamptz,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_assets_node ON public.knowledge_assets(knowledge_node_id);

-- ─── engagements (was "CH Startup Relationships [OS v2]") ────────────────────
CREATE TABLE IF NOT EXISTS public.engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  relationship_name text NOT NULL,
  engagement_type text,         -- Client | Partner | Investor | Funder | Vendor
  relationship_status text,     -- Active | Inactive | Closed
  engagement_value numeric,
  budget_readiness text,
  strategic_exposure text,
  notes text,
  notes_on_terms text,
  territories_covered text,
  org_notion_id text,
  primary_owner_notion_id text,
  ch_value_add_summary text,
  start_date date,
  end_date date,
  expected_close_date date,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engagements_org ON public.engagements(org_notion_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON public.engagements(relationship_status);
CREATE INDEX IF NOT EXISTS idx_engagements_type ON public.engagements(engagement_type);

-- ─── proposal_briefs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  status text,
  brief_md text,
  org_notion_id text,
  opportunity_notion_id text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposal_briefs_org ON public.proposal_briefs(org_notion_id);

-- ─── offers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  status text,
  offer_value numeric,
  currency text,
  org_notion_id text,
  opportunity_notion_id text,
  proposal_brief_notion_id text,
  sent_at date,
  responded_at date,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offers_org ON public.offers(org_notion_id);

-- ─── grant_sources ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grant_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  funder_name text,
  funder_url text,
  funder_country text,
  status text,
  amount_min numeric,
  amount_max numeric,
  currency text,
  deadline date,
  themes text[],
  geography text,
  notes text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grant_sources_deadline ON public.grant_sources(deadline) WHERE deadline IS NOT NULL;

-- ─── valuations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  org_notion_id text NOT NULL,
  valuation_date date,
  pre_money numeric,
  post_money numeric,
  currency text,
  source text,
  notes text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_valuations_org ON public.valuations(org_notion_id);

-- ─── cap_table_entries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cap_table_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  org_notion_id text NOT NULL,
  shareholder_name text NOT NULL,
  shareholder_type text,
  shares numeric,
  ownership_pct numeric,
  share_class text,
  as_of_date date,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_table_org ON public.cap_table_entries(org_notion_id);

-- ─── data_room_documents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_room_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  org_notion_id text NOT NULL,
  doc_name text NOT NULL,
  doc_type text,
  drive_url text,
  uploaded_at timestamptz,
  uploaded_by text,
  access_level text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_room_org ON public.data_room_documents(org_notion_id);

-- ─── financial_snapshots ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  scope_org_notion_id text,
  scope_project_notion_id text,
  snapshot_date date NOT NULL,
  mrr numeric,
  arr numeric,
  cash_balance numeric,
  burn_rate numeric,
  runway_months numeric,
  team_size integer,
  currency text,
  notes text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_snapshots_org ON public.financial_snapshots(scope_org_notion_id) WHERE scope_org_notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_snapshots_project ON public.financial_snapshots(scope_project_notion_id) WHERE scope_project_notion_id IS NOT NULL;

-- ─── insight_briefs (replaces notion_insight_briefs mirror) ──────────────────
CREATE TABLE IF NOT EXISTS public.insight_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  brief_type text,
  body_md text,
  status text,
  scope text,
  org_notion_id text,
  project_notion_id text,
  evidence_count integer NOT NULL DEFAULT 0,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── content_pipeline_items (replaces notion_content_pipeline mirror) ────────
CREATE TABLE IF NOT EXISTS public.content_pipeline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  channel text,
  status text,
  pillar text,
  audience text,
  hook_md text,
  body_md text,
  scheduled_for date,
  published_at date,
  approved_by text,
  approved_at timestamptz,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── style_profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  name text NOT NULL,
  channel text,
  voice_md text,
  do_examples text,
  dont_examples text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── agent_drafts (replaces notion_agent_drafts mirror) ──────────────────────
CREATE TABLE IF NOT EXISTS public.agent_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  draft_type text NOT NULL,
  status text NOT NULL DEFAULT 'Pending Review',
  title text,
  body_md text NOT NULL,
  target_person_notion_id text,
  target_org_notion_id text,
  source_agent text,
  approved_at timestamptz,
  approved_by text,
  superseded_by uuid REFERENCES public.agent_drafts(id) ON DELETE SET NULL,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_status ON public.agent_drafts(status);

-- ─── daily_briefings (replaces notion_daily_briefings mirror) ────────────────
CREATE TABLE IF NOT EXISTS public.daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  briefing_date date NOT NULL,
  title text NOT NULL,
  body_md text,
  source_agent text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date ON public.daily_briefings(briefing_date DESC);

-- ─── watchlist_entities (replaces notion_watchlist mirror) ───────────────────
CREATE TABLE IF NOT EXISTS public.watchlist_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  name text NOT NULL,
  watch_type text,
  url text,
  themes text[],
  notes text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── competitive_intel (replaces notion_competitive_intel mirror) ────────────
CREATE TABLE IF NOT EXISTS public.competitive_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  watchlist_entity_notion_id text,
  signal_date date,
  signal_type text,
  title text NOT NULL,
  body_md text,
  url text,
  source_agent text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitive_intel_signal_date ON public.competitive_intel(signal_date DESC) WHERE signal_date IS NOT NULL;

-- ─── conversations (parent of conversation_messages) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  legacy_notion_id text,
  legacy_source_db text,
  title text NOT NULL,
  platform text NOT NULL,
  source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  thread_external_id text,
  participant_count integer,
  message_count integer NOT NULL DEFAULT 0,
  first_message_at timestamptz,
  last_message_at timestamptz,
  org_notion_id text,
  project_notion_id text,
  notion_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_thread ON public.conversations(thread_external_id) WHERE thread_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON public.conversations(platform);
CREATE INDEX IF NOT EXISTS idx_conversations_org ON public.conversations(org_notion_id) WHERE org_notion_id IS NOT NULL;
