-- Portal 2.0 — atomic acceptance of a state proposal
--
-- Accepting a proposal must mutate state + write its revision + close the proposal
-- in ONE transaction. The previous TS path did four sequential writes and could
-- leave state half-applied on a mid-run crash. This RPC mirrors
-- respond_to_project_agreement: SELECT ... FOR UPDATE, a clear conflict when the
-- proposal is no longer pending, in-function re-validation of every enum/payload
-- field before any mutation, a useful revision snapshot (affected state + applied
-- entity), and it returns the applied proposal so the API writes nothing else.

create or replace function public.apply_state_proposal(
  p_proposal_id uuid,
  p_project_id uuid,
  p_actor text
)
returns public.project_state_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop public.project_state_proposals;
  v_payload jsonb;
  v_kind text;
  v_item public.project_state_items;
  v_state public.project_states;
  v_learning public.project_learning_items;
  v_revision_id uuid;
  v_applied_item_id uuid;
  v_status text;
  v_item_type text;
  v_health text;
  v_learning_type text;
  v_due timestamptz;
  v_stale timestamptz;
  v_merged_refs text[];
  v_snapshot jsonb;
begin
  -- Lock the proposal for the duration of the transaction.
  select * into v_prop from public.project_state_proposals
   where id = p_proposal_id
   for update;
  if not found then
    raise exception 'proposal not found';
  end if;
  -- Scope to the project BEFORE mutating (a later API-side check would be too late).
  if v_prop.project_id <> p_project_id then
    raise exception 'proposal does not belong to project';
  end if;
  if v_prop.status <> 'pending' then
    -- errcode object_not_in_prerequisite_state → API maps to 409.
    raise exception 'proposal % is not pending (status=%)', p_proposal_id, v_prop.status
      using errcode = '55000';
  end if;

  v_payload := coalesce(v_prop.payload, '{}'::jsonb);
  v_kind := v_prop.proposal_kind;

  if v_kind = 'add_item' then
    v_item_type := coalesce(v_prop.item_type, v_payload->>'item_type');
    if v_item_type is null or v_item_type not in
      ('decision','commitment','risk','dependency','question','milestone','stakeholder_signal','assumption','outcome')
    then raise exception 'invalid item_type %', v_item_type; end if;
    if nullif(trim(v_payload->>'statement'),'') is null then
      raise exception 'add_item requires a statement';
    end if;

    begin v_due := nullif(v_payload->>'due_at','')::timestamptz; exception when others then v_due := null; end;
    begin v_stale := nullif(v_payload->>'stale_after','')::timestamptz; exception when others then v_stale := null; end;
    if v_stale is null then v_stale := now() + interval '45 days'; end if;

    insert into public.project_state_items (
      project_id, item_type, statement, owner_label, stakeholder_label,
      source_refs, confidence, due_at, stale_after, last_confirmed_at, created_by, updated_by
    ) values (
      v_prop.project_id, v_item_type, trim(v_payload->>'statement'),
      nullif(trim(v_payload->>'owner_label'),''), nullif(trim(v_payload->>'stakeholder_label'),''),
      coalesce(v_prop.source_refs, '{}'), v_prop.confidence, v_due, v_stale, now(), p_actor, p_actor
    ) returning * into v_item;
    v_applied_item_id := v_item.id;

  elsif v_kind in ('update_item','resolve_item') then
    if v_prop.target_item_id is null then
      raise exception '% requires a target item', v_kind;
    end if;
    select * into v_item from public.project_state_items
     where id = v_prop.target_item_id and project_id = v_prop.project_id
     for update;
    if not found then raise exception 'target state item not found'; end if;

    v_status := nullif(trim(v_payload->>'status'),'');
    if v_kind = 'resolve_item' then
      v_status := coalesce(v_status, 'resolved');
      if v_status not in ('resolved','superseded','unknown','expired') then
        raise exception 'invalid resolve status %', v_status;
      end if;
    elsif v_status is not null and v_status not in ('active','resolved','superseded','unknown','expired') then
      raise exception 'invalid update status %', v_status;
    end if;

    begin v_due := nullif(v_payload->>'due_at','')::timestamptz; exception when others then v_due := null; end;
    -- Merge the cited evidence into the item's refs for traceability.
    v_merged_refs := array(
      select distinct e from unnest(coalesce(v_item.source_refs,'{}') || coalesce(v_prop.source_refs,'{}')) as e
    );

    update public.project_state_items set
      status            = coalesce(v_status, status),
      owner_label       = coalesce(nullif(trim(v_payload->>'owner_label'),''), owner_label),
      stakeholder_label = coalesce(nullif(trim(v_payload->>'stakeholder_label'),''), stakeholder_label),
      due_at            = coalesce(v_due, due_at),
      resolution_note   = coalesce(nullif(trim(v_payload->>'resolution_note'),''), resolution_note),
      last_confirmed_at = case when v_kind = 'update_item' and v_status = 'active' then now() else last_confirmed_at end,
      source_refs       = v_merged_refs,
      updated_by        = p_actor,
      updated_at        = now()
    where id = v_item.id
    returning * into v_item;
    v_applied_item_id := v_item.id;

  elsif v_kind = 'state_summary' then
    v_health := nullif(trim(v_payload->>'health'),'');
    if v_health is not null and v_health not in ('on_track','watch','blocked','paused','unknown') then
      raise exception 'invalid health %', v_health;
    end if;

    insert into public.project_states (
      project_id, current_summary, current_phase, current_focus, health,
      updated_by, last_state_change_at, updated_at
    ) values (
      v_prop.project_id,
      nullif(trim(v_payload->>'current_summary'),''),
      nullif(trim(v_payload->>'current_phase'),''),
      nullif(trim(v_payload->>'current_focus'),''),
      coalesce(v_health, 'unknown'),
      p_actor, now(), now()
    )
    on conflict (project_id) do update set
      current_summary      = coalesce(nullif(trim(v_payload->>'current_summary'),''), public.project_states.current_summary),
      current_phase        = coalesce(nullif(trim(v_payload->>'current_phase'),''), public.project_states.current_phase),
      current_focus        = coalesce(nullif(trim(v_payload->>'current_focus'),''), public.project_states.current_focus),
      health               = coalesce(v_health, public.project_states.health),
      updated_by           = p_actor,
      last_state_change_at = now(),
      updated_at           = now()
    returning * into v_state;

  elsif v_kind = 'add_learning' then
    v_learning_type := coalesce(nullif(trim(v_payload->>'learning_type'),''), 'implementation_question');
    if v_learning_type not in ('implementation_question','stakeholder_need','friction','decision_pattern','operating_pattern','outcome') then
      raise exception 'invalid learning_type %', v_learning_type;
    end if;
    if nullif(trim(v_payload->>'title'),'') is null or nullif(trim(v_payload->>'observation'),'') is null then
      raise exception 'add_learning requires a title and observation';
    end if;

    insert into public.project_learning_items (
      project_id, learning_type, area, title, observation, implication,
      status, transferability, confidence, source_refs, last_seen_at, created_by, updated_by
    ) values (
      v_prop.project_id, v_learning_type,
      nullif(trim(v_payload->>'area'),''), trim(v_payload->>'title'), trim(v_payload->>'observation'),
      nullif(trim(v_payload->>'implication'),''),
      'observed', 'project', v_prop.confidence, coalesce(v_prop.source_refs,'{}'), now(), p_actor, p_actor
    ) returning * into v_learning;

  else
    raise exception 'invalid proposal_kind %', v_kind;
  end if;

  -- Snapshot the affected state + the applied entity for a useful audit trail.
  if v_state.project_id is null then
    select * into v_state from public.project_states where project_id = v_prop.project_id;
  end if;
  v_snapshot := jsonb_build_object(
    'proposal_kind', v_kind,
    'state', case when v_state.project_id is not null then to_jsonb(v_state) else null end,
    'applied_item', case when v_item.id is not null then to_jsonb(v_item) else null end,
    'applied_learning', case when v_learning.id is not null then to_jsonb(v_learning) else null end
  );

  insert into public.project_state_revisions (project_id, action, actor, snapshot, note)
  values (
    v_prop.project_id, 'system_refresh', p_actor, v_snapshot,
    format('Accepted proposal %s: %s', v_prop.id, v_prop.summary)
  )
  returning id into v_revision_id;

  update public.project_state_proposals set
    status              = 'accepted',
    reviewed_by         = p_actor,
    reviewed_at         = now(),
    applied_item_id     = v_applied_item_id,
    applied_revision_id = v_revision_id,
    updated_at          = now()
  where id = p_proposal_id
  returning * into v_prop;

  return v_prop;
end;
$$;

revoke all on function public.apply_state_proposal(uuid, uuid, text) from public;
revoke all on function public.apply_state_proposal(uuid, uuid, text) from anon;
revoke all on function public.apply_state_proposal(uuid, uuid, text) from authenticated;
grant execute on function public.apply_state_proposal(uuid, uuid, text) to service_role;

comment on function public.apply_state_proposal(uuid, uuid, text) is
  'Atomically applies a pending project_state_proposal: mutates the state item / summary / learning, writes a system_refresh revision with a snapshot, and closes the proposal. Re-validates enums and payload in-transaction. Returns the applied proposal.';
