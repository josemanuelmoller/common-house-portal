-- Portal 2.0 — Phase 6: typed relations from state to people/organizations
--
-- State items and learning items carry free-text owner_label / stakeholder_label.
-- This adds typed links to the canonical people / organizations rows so the same
-- claim resolves to a real entity, enabling a person/organization view across
-- projects. Labels are kept — links are an additive resolution layer, best-effort
-- via trigram matching, never destructive.

create table if not exists public.project_entity_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subject_type text not null check (subject_type in ('state_item', 'learning_item')),
  subject_id uuid not null,
  entity_type text not null check (entity_type in ('person', 'organization')),
  entity_id uuid not null,
  relation text not null default 'stakeholder'
    check (relation in ('owner', 'stakeholder', 'mentioned', 'accountable', 'informed', 'decision_maker')),
  source_label text,
  match_score real,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_entity_links_unique
  on public.project_entity_links (subject_type, subject_id, entity_type, entity_id, relation);
-- Reverse lookup: everything linked to a given person/organization (the entity view).
create index if not exists project_entity_links_entity_idx
  on public.project_entity_links (entity_type, entity_id);
create index if not exists project_entity_links_subject_idx
  on public.project_entity_links (subject_type, subject_id);

alter table public.project_entity_links enable row level security;
revoke all on public.project_entity_links from anon, authenticated;

-- Trigram indexes for name resolution (pg_trgm enabled in the calibration migration).
create index if not exists people_full_name_trgm on public.people using gin (full_name gin_trgm_ops);
create index if not exists organizations_name_trgm on public.organizations using gin (name gin_trgm_ops);

-- Resolve a free-text label to the best-matching person or organization and link
-- it to a subject. Idempotent (unique index). Returns the number of links made.
create or replace function public.link_subject_entities(
  p_project_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_owner_label text,
  p_stakeholder_label text,
  p_actor text default 'system',
  p_threshold real default 0.4
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
    select id, similarity(full_name, p_owner_label) into v_id, v_score
      from public.people
      where full_name is not null and similarity(full_name, p_owner_label) >= p_threshold
      order by similarity(full_name, p_owner_label) desc, id limit 1;
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
      select id, similarity(full_name, p_stakeholder_label) into v_person_id, v_person_score
        from public.people
        where full_name is not null and similarity(full_name, p_stakeholder_label) >= p_threshold
        order by similarity(full_name, p_stakeholder_label) desc, id limit 1;
      select id, similarity(name, p_stakeholder_label) into v_org_id, v_org_score
        from public.organizations
        where name is not null and similarity(name, p_stakeholder_label) >= p_threshold
        order by similarity(name, p_stakeholder_label) desc, id limit 1;

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

revoke all on function public.link_subject_entities(uuid, text, uuid, text, text, text, real) from public;
revoke all on function public.link_subject_entities(uuid, text, uuid, text, text, text, real) from anon;
revoke all on function public.link_subject_entities(uuid, text, uuid, text, text, text, real) from authenticated;
grant execute on function public.link_subject_entities(uuid, text, uuid, text, text, text, real) to service_role;

comment on table public.project_entity_links is
  'Typed links from state items / learning items to canonical people / organizations. Additive resolution over the free-text labels; enables the cross-project entity view.';
comment on function public.link_subject_entities(uuid, text, uuid, text, text, text, real) is
  'Best-effort trigram resolution of owner/stakeholder labels to a person or organization, inserting typed links (idempotent). Returns links created.';
