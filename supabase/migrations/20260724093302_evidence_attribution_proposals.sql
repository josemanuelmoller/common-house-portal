-- Human-review queue for medium-confidence evidence attribution proposals.
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-24 (recorded version 20260724093302, name evidence_attribution_proposals)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. Every statement
-- is guarded, so re-running is safe.

-- Human-review queue for medium-confidence attribution proposals. The LLM
-- classifier writes here instead of auto-applying; a human approves / adjusts /
-- rejects. High-confidence still auto-applies to evidence directly.
create table if not exists public.evidence_attribution_proposals (
  id                         uuid primary key default gen_random_uuid(),
  evidence_id                uuid not null references public.evidence(id) on delete cascade,
  evidence_snippet           text,
  current_project_notion_id  text,
  current_org_notion_id      text,
  proposed_project_notion_id text,
  proposed_project_name      text,
  proposed_org_notion_id     text,
  proposed_org_name          text,
  confidence                 text,
  reason                     text,
  status                     text not null default 'pending',  -- pending | approved | adjusted | rejected
  decided_at                 timestamptz,
  decided_by                 text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique(evidence_id)
);
create index if not exists idx_eap_status on public.evidence_attribution_proposals(status);
alter table public.evidence_attribution_proposals enable row level security;
