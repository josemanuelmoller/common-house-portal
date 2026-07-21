-- ADR-001 Phase 1 — connect opportunities to typed orgs and to the project a won opportunity creates.
-- ADDITIVE ONLY. Existing opportunities.status / org_notion_id / org_name are preserved and untouched.
-- The atomic convert_opportunity_to_project() RPC and the Client-Room opportunity_id change are DEFERRED to a
-- coordinated step AFTER the common-house-portal Room migration (ADR §4.3, §8 sequencing) — not in this file.

alter table public.opportunities
  add column if not exists organization_id     uuid,
  add column if not exists converted_project_id uuid,
  add column if not exists next_revisit_at      timestamptz,
  add column if not exists closed_reason        text,
  -- Canonical lifecycle stage layered over legacy `status` (nullable = derive from status in app).
  add column if not exists canonical_stage      text;

-- FKs added guarded so re-run is safe and a missing target never hard-fails the whole migration.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opportunities_organization_id_fkey') then
    alter table public.opportunities
      add constraint opportunities_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_converted_project_id_fkey') then
    alter table public.opportunities
      add constraint opportunities_converted_project_id_fkey
      foreign key (converted_project_id) references public.projects(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_canonical_stage_ck') then
    alter table public.opportunities
      add constraint opportunities_canonical_stage_ck
      check (canonical_stage is null or canonical_stage in ('exploration','proposal','won','lost','not_now'));
  end if;
end $$;

create index if not exists ix_opp_organization_id      on public.opportunities (organization_id);
create index if not exists ix_opp_converted_project_id on public.opportunities (converted_project_id);
create index if not exists ix_opp_canonical_stage      on public.opportunities (canonical_stage);
