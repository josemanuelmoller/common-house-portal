-- Portal 2.0 — harden learning→knowledge promotion, entity resolution, and
-- record the applied learning on acceptance.
--
-- Additive: one new nullable column + CREATE OR REPLACE on three security-definer
-- RPCs (search_path=public, service_role only) already granted in prior migrations.

-- Backlink the learning created when an add_learning proposal is accepted, so the
-- acceptance path can resolve its entity links (mirrors applied_item_id for state items).
alter table public.project_state_proposals
  add column if not exists applied_learning_id uuid references public.project_learning_items(id) on delete set null;

-- ─── Promotion guard: Observed → Review → Confirmed → Promote ────────────────
-- Requires status='review' AND transferability='confirmed' AND ≥1 source. A
-- 'candidate' learning no longer qualifies on its own; a one-off never promotes.
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

  if v_learn.status <> 'review' then
    raise exception 'learning must be in review before promotion (Observed → Review → Confirmed → Promote)';
  end if;
  if v_learn.transferability <> 'confirmed' then
    raise exception 'learning must be confirmed before promotion';
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
    values (v_learn.title, left(v_learn.observation, 400), v_section, 'playbook', 'candidate', v_evidence_n, now())
    returning * into v_asset;
  end if;

  update public.project_learning_items set
    status = 'promoted',
    promoted_knowledge_asset_id = v_asset.id,
    updated_by = p_actor,
    updated_at = now()
  where id = p_learning_id;

  return v_asset;
end;
$$;

-- ─── Entity resolution: prefer exact (accent-insensitive), else high trigram ──
-- A false link is worse than none. Default threshold 0.85; exact match on
-- unaccent(lower()) wins. Below threshold → left unresolved.
create or replace function public.link_subject_entities(
  p_project_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_owner_label text,
  p_stakeholder_label text,
  p_actor text default 'system',
  p_threshold real default 0.85
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_id uuid;
  v_score real;
begin
  -- owner_label → person (owner)
  if nullif(trim(p_owner_label), '') is not null then
    -- exact (accent-insensitive) first
    select id, 1.0 into v_id, v_score from public.people
      where full_name is not null and lower(unaccent(full_name)) = lower(unaccent(p_owner_label))
      order by id limit 1;
    if v_id is null then
      select id, similarity(full_name, p_owner_label) into v_id, v_score from public.people
        where full_name is not null and similarity(full_name, p_owner_label) >= p_threshold
        order by similarity(full_name, p_owner_label) desc, id limit 1;
    end if;
    if v_id is not null then
      insert into public.project_entity_links (project_id, subject_type, subject_id, entity_type, entity_id, relation, source_label, match_score, created_by)
      values (p_project_id, p_subject_type, p_subject_id, 'person', v_id, 'owner', p_owner_label, v_score, p_actor)
      on conflict do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end if;

  -- stakeholder_label → best of person or organization (stakeholder)
  if nullif(trim(p_stakeholder_label), '') is not null then
    declare
      v_person_id uuid; v_person_score real := 0;
      v_org_id uuid; v_org_score real := 0;
    begin
      select id, 1.0 into v_person_id, v_person_score from public.people
        where full_name is not null and lower(unaccent(full_name)) = lower(unaccent(p_stakeholder_label)) order by id limit 1;
      if v_person_id is null then
        select id, similarity(full_name, p_stakeholder_label) into v_person_id, v_person_score from public.people
          where full_name is not null and similarity(full_name, p_stakeholder_label) >= p_threshold
          order by similarity(full_name, p_stakeholder_label) desc, id limit 1;
      end if;
      select id, 1.0 into v_org_id, v_org_score from public.organizations
        where name is not null and lower(unaccent(name)) = lower(unaccent(p_stakeholder_label)) order by id limit 1;
      if v_org_id is null then
        select id, similarity(name, p_stakeholder_label) into v_org_id, v_org_score from public.organizations
          where name is not null and similarity(name, p_stakeholder_label) >= p_threshold
          order by similarity(name, p_stakeholder_label) desc, id limit 1;
      end if;

      if v_person_id is not null and coalesce(v_person_score,0) >= coalesce(v_org_score,0) then
        insert into public.project_entity_links (project_id, subject_type, subject_id, entity_type, entity_id, relation, source_label, match_score, created_by)
        values (p_project_id, p_subject_type, p_subject_id, 'person', v_person_id, 'stakeholder', p_stakeholder_label, v_person_score, p_actor)
        on conflict do nothing;
        if found then v_count := v_count + 1; end if;
      elsif v_org_id is not null then
        insert into public.project_entity_links (project_id, subject_type, subject_id, entity_type, entity_id, relation, source_label, match_score, created_by)
        values (p_project_id, p_subject_type, p_subject_id, 'organization', v_org_id, 'stakeholder', p_stakeholder_label, v_org_score, p_actor)
        on conflict do nothing;
        if found then v_count := v_count + 1; end if;
      end if;
    end;
  end if;

  return v_count;
end;
$$;

comment on function public.promote_learning_item(uuid, uuid, text, uuid) is
  'Guarded promotion: requires status=review, transferability=confirmed and >=1 evidence source. Observed -> Review -> Confirmed -> Promote. Never auto-promotes.';
comment on function public.link_subject_entities(uuid, text, uuid, text, text, text, real) is
  'Resolves owner/stakeholder labels to a person/organization. Exact (accent-insensitive) preferred, else trigram >= 0.85, else unresolved. A false link is worse than none.';
