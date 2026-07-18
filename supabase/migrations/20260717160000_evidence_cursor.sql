-- Portal 2.0 — correct evidence cursor for the state-refresh job
--
-- The previous delta advanced the window to now() while reading created_at DESC
-- LIMIT N, so a project with more than N new rows lost the oldest ones forever,
-- and created_at (ingest time) missed evidence validated or later corrected.
--
-- Fix: a per-project keyset cursor over (updated_at, id) filtering Validated
-- evidence, advancing only to the max row actually processed. updated_at (not
-- validated_at) is deliberate — it moves on any operational change while the
-- evidence stays Validated, so a later resolve/revert/correction is re-seen,
-- which is exactly the reversal we want to detect. If updated_at proves too
-- noisy, a dedicated operational_updated_at can replace it without touching the
-- job's cursor logic.

create table if not exists public.project_evidence_cursors (
  project_id uuid primary key references public.projects(id) on delete cascade,
  -- Keyset position: the (updated_at, id) of the last evidence row processed.
  cursor_updated_at timestamptz not null,
  cursor_id uuid not null default '00000000-0000-0000-0000-000000000000',
  last_run_at timestamptz,
  batches_processed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_evidence_cursors enable row level security;
revoke all on public.project_evidence_cursors from anon, authenticated;

-- Keyset scan support: ordered (updated_at, id) per project over Validated rows.
create index if not exists evidence_project_keyset_idx
  on public.evidence (project_notion_id, updated_at, id)
  where validation_status = 'Validated';

-- Keyset read. Row-value comparison keeps it correct and index-friendly, and
-- avoids encoding timestamps into PostgREST or-filters on the client.
create or replace function public.next_evidence_batch(
  p_project_notion_id text,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit int
)
returns setof public.evidence
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.evidence
  where project_notion_id = p_project_notion_id
    and validation_status = 'Validated'
    and (updated_at, id) > (p_cursor_at, p_cursor_id)
  order by updated_at asc, id asc
  limit greatest(coalesce(p_limit, 40), 1);
$$;

revoke all on function public.next_evidence_batch(text, timestamptz, uuid, int) from public;
revoke all on function public.next_evidence_batch(text, timestamptz, uuid, int) from anon;
revoke all on function public.next_evidence_batch(text, timestamptz, uuid, int) from authenticated;
grant execute on function public.next_evidence_batch(text, timestamptz, uuid, int) to service_role;

comment on table public.project_evidence_cursors is
  'Per-project keyset cursor (updated_at, id) marking the last Validated evidence row the state-refresh job has processed. Advances only to the max row actually read — never to now() — so nothing is skipped past the batch cap.';
comment on function public.next_evidence_batch(text, timestamptz, uuid, int) is
  'Returns the next batch of Validated evidence for a project strictly after the (updated_at, id) cursor, ordered ascending. Keyset pagination; no skips, no re-reads.';
