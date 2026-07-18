-- Portal 2.0 — state-refresh calibration: dedup support
--
-- The job can propose a claim that is near-identical to an existing active claim
-- or to a still-pending proposal (the same fact surfacing in new evidence). A
-- trigram similarity check lets the job drop those duplicates server-side before
-- insert. Impact threshold and per-run cap are enforced in code.

create extension if not exists pg_trgm;

create index if not exists project_state_items_statement_trgm
  on public.project_state_items using gin (statement gin_trgm_ops);

-- True when the project already carries a near-identical claim, either as an
-- active state item or as a still-pending add_item proposal. Used to suppress
-- duplicate add_item proposals across runs.
create or replace function public.similar_state_claim(
  p_project_id uuid,
  p_statement text,
  p_threshold real default 0.5
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_state_items i
    where i.project_id = p_project_id
      and i.status = 'active'
      and similarity(i.statement, p_statement) >= p_threshold
  ) or exists (
    select 1 from public.project_state_proposals p
    where p.project_id = p_project_id
      and p.status = 'pending'
      and p.proposal_kind = 'add_item'
      and similarity(coalesce(p.payload->>'statement',''), p_statement) >= p_threshold
  );
$$;

revoke all on function public.similar_state_claim(uuid, text, real) from public;
revoke all on function public.similar_state_claim(uuid, text, real) from anon;
revoke all on function public.similar_state_claim(uuid, text, real) from authenticated;
grant execute on function public.similar_state_claim(uuid, text, real) to service_role;

comment on function public.similar_state_claim(uuid, text, real) is
  'True if the project already has a near-identical (trigram) active claim or pending add_item proposal. Used by the state-refresh job to drop duplicate add_item proposals.';
