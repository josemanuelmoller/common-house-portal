-- Portal 2.0 — Phase 7: promote implementation learning to a knowledge asset
--
-- Implementation learning sits below the institutional-knowledge threshold. This
-- RPC is the guarded promotion path: observed → review → promoted. It refuses to
-- promote a raw one-off (must be marked candidate/confirmed AND carry evidence
-- source_refs), creates or appends a knowledge_assets row, backlinks the learning
-- to that asset, and returns the asset. Atomic and idempotent-safe.

create or replace function public.promote_learning_item(
  p_learning_id uuid,
  p_project_id uuid,
  p_actor text,
  p_target_asset_id uuid default null
)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learn public.project_learning_items;
  v_asset public.knowledge_assets;
  v_project_name text;
  v_evidence_n integer;
  v_section text;
begin
  select * into v_learn from public.project_learning_items
   where id = p_learning_id for update;
  if not found then raise exception 'learning item not found'; end if;
  if v_learn.project_id <> p_project_id then raise exception 'learning does not belong to project'; end if;
  if v_learn.status = 'promoted' then
    raise exception 'learning already promoted' using errcode = '55000';
  end if;

  -- Guardrails: not a one-off, and source-backed.
  if v_learn.transferability not in ('candidate', 'confirmed') then
    raise exception 'learning must be marked candidate or confirmed (reviewed) before promotion';
  end if;
  v_evidence_n := coalesce(array_length(v_learn.source_refs, 1), 0);
  if v_evidence_n = 0 then
    raise exception 'learning has no evidence source_refs; cannot promote unsourced knowledge';
  end if;

  select name into v_project_name from public.projects where id = v_learn.project_id;

  v_section := format(
    E'## %s\n\n%s%s\n\n_Promoted from implementation learning on %s. Evidence: %s._',
    v_learn.title,
    v_learn.observation,
    case when nullif(trim(v_learn.implication), '') is not null then E'\n\n**Implication:** ' || v_learn.implication else '' end,
    coalesce(v_project_name, 'a project'),
    array_to_string(v_learn.source_refs, ', ')
  );

  if p_target_asset_id is not null then
    update public.knowledge_assets set
      body_md = coalesce(body_md, '') || E'\n\n' || v_section,
      evidence_count = coalesce(evidence_count, 0) + v_evidence_n,
      last_evidence_at = now(),
      updated_at = now()
    where id = p_target_asset_id
    returning * into v_asset;
    if not found then raise exception 'target knowledge asset not found'; end if;
  else
    insert into public.knowledge_assets (title, summary, body_md, asset_type, status, evidence_count, last_evidence_at)
    values (
      v_learn.title,
      left(v_learn.observation, 400),
      v_section,
      'playbook',
      'candidate',
      v_evidence_n,
      now()
    )
    returning * into v_asset;
  end if;

  update public.project_learning_items set
    status = 'promoted',
    transferability = 'confirmed',
    promoted_knowledge_asset_id = v_asset.id,
    updated_by = p_actor,
    updated_at = now()
  where id = p_learning_id;

  return v_asset;
end;
$$;

revoke all on function public.promote_learning_item(uuid, uuid, text, uuid) from public;
revoke all on function public.promote_learning_item(uuid, uuid, text, uuid) from anon;
revoke all on function public.promote_learning_item(uuid, uuid, text, uuid) from authenticated;
grant execute on function public.promote_learning_item(uuid, uuid, text, uuid) to service_role;

comment on function public.promote_learning_item(uuid, uuid, text, uuid) is
  'Guarded promotion of a reviewed (candidate/confirmed), source-backed implementation learning into a knowledge_assets row (new or appended). Backlinks the learning and returns the asset. Refuses one-offs and unsourced learnings.';
