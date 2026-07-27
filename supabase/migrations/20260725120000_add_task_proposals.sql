-- add_task proposals — el puente action_items → tarea de sala.
--
-- Antes de esto había dos sistemas paralelos que no se tocaban:
--   · capa de estado: project_state_proposals → project_state_items, aplicada
--     atómicamente por apply_state_proposal().
--   · capa de trabajo de la sala: project_tasks, solo a mano.
-- La lista blanca de item_type del RPC no incluía 'task', así que la sala no
-- podía llamarlo y su ruta de confirmar cambiaba el status a mano: la propuesta
-- quedaba 'accepted' y no se creaba ninguna tarea (1 caso así en prod).
--
-- Acá se agrega proposal_kind='add_task', que el RPC aplica creando la fila en
-- project_tasks. La aceptación sigue siendo atómica y queda registrada en
-- project_state_revisions igual que el resto.
--
-- Además: si el payload trae action_item_id, al aceptar se resuelve el
-- action_item con reason='promoted_to_task'. El seguimiento se muda a la sala,
-- y de paso stale-decay y sweep-replied-threads dejan de pelear por él.

alter table public.project_state_proposals
  add column if not exists applied_task_id uuid
  references public.project_tasks(id) on delete set null;

-- 'promoted_to_task' es un cierre nuevo: el item no se hizo ni se venció, se
-- mudó a la sala. Sin esto el CHECK aborta la aceptación entera.
alter table public.action_items
  drop constraint if exists action_items_resolved_reason_check;

alter table public.action_items
  add constraint action_items_resolved_reason_check
  check (resolved_reason is null or resolved_reason = any (array[
    'reply_sent', 'loop_closed', 'deadline_passed', 'manual_dismiss',
    'manual_done', 'deduped', 'stale_decay', 'promoted_to_task'
  ]));

alter table public.project_state_proposals
  drop constraint if exists project_state_proposals_proposal_kind_check;

alter table public.project_state_proposals
  add constraint project_state_proposals_proposal_kind_check
  check (proposal_kind = any (array[
    'add_item', 'update_item', 'resolve_item',
    'state_summary', 'add_learning', 'room_structure', 'add_task'
  ]));

-- Un action_item no se propone dos veces mientras la propuesta siga viva.
create unique index if not exists project_state_proposals_action_item_uniq
  on public.project_state_proposals ((payload->>'action_item_id'))
  where proposal_kind = 'add_task'
    and status in ('pending', 'accepted')
    and payload->>'action_item_id' is not null;

create or replace function public.apply_state_proposal(
  p_proposal_id uuid, p_project_id uuid, p_actor text)
 returns project_state_proposals
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_prop public.project_state_proposals;
  v_payload jsonb; v_kind text;
  v_item public.project_state_items; v_state public.project_states; v_learning public.project_learning_items;
  v_task public.project_tasks;
  v_revision_id uuid; v_applied_item_id uuid; v_applied_learning_id uuid; v_applied_task_id uuid;
  v_status text; v_item_type text; v_health text; v_learning_type text;
  v_due timestamptz; v_stale timestamptz; v_merged_refs text[]; v_snapshot jsonb;
  v_task_due date; v_side text; v_owner uuid; v_action_item_id uuid; v_position int;
begin
  select * into v_prop from public.project_state_proposals where id = p_proposal_id for update;
  if not found then raise exception 'proposal not found'; end if;
  if v_prop.project_id <> p_project_id then raise exception 'proposal does not belong to project'; end if;
  if v_prop.status <> 'pending' then raise exception 'proposal % is not pending (status=%)', p_proposal_id, v_prop.status using errcode = '55000'; end if;

  v_payload := coalesce(v_prop.payload, '{}'::jsonb);
  v_kind := v_prop.proposal_kind;

  if v_kind = 'add_item' then
    v_item_type := coalesce(v_prop.item_type, v_payload->>'item_type');
    if v_item_type is null or v_item_type not in ('decision','commitment','risk','dependency','question','milestone','stakeholder_signal','assumption','outcome') then raise exception 'invalid item_type %', v_item_type; end if;
    if nullif(trim(v_payload->>'statement'),'') is null then raise exception 'add_item requires a statement'; end if;
    begin v_due := nullif(v_payload->>'due_at','')::timestamptz; exception when others then v_due := null; end;
    begin v_stale := nullif(v_payload->>'stale_after','')::timestamptz; exception when others then v_stale := null; end;
    if v_stale is null then v_stale := now() + interval '45 days'; end if;
    insert into public.project_state_items (project_id, item_type, statement, owner_label, stakeholder_label, source_refs, confidence, due_at, stale_after, last_confirmed_at, created_by, updated_by)
    values (v_prop.project_id, v_item_type, trim(v_payload->>'statement'), nullif(trim(v_payload->>'owner_label'),''), nullif(trim(v_payload->>'stakeholder_label'),''), coalesce(v_prop.source_refs, '{}'), v_prop.confidence, v_due, v_stale, now(), p_actor, p_actor)
    returning * into v_item;
    v_applied_item_id := v_item.id;

  elsif v_kind = 'add_task' then
    -- Tarea de sala. El título es lo único obligatorio; el resto del payload es
    -- opcional y se valida contra los mismos CHECK de project_tasks.
    if nullif(trim(v_payload->>'title'),'') is null then raise exception 'add_task requires a title'; end if;
    v_side := coalesce(nullif(trim(v_payload->>'assignee_side'),''), 'team');
    if v_side not in ('team','client') then raise exception 'invalid assignee_side %', v_side; end if;
    begin v_task_due := nullif(v_payload->>'due_date','')::date; exception when others then v_task_due := null; end;
    begin v_owner := nullif(v_payload->>'owner_person_id','')::uuid; exception when others then v_owner := null; end;
    -- Un owner que no existe no puede tumbar la aceptación: se cae a null.
    if v_owner is not null and not exists (select 1 from public.people where id = v_owner) then v_owner := null; end if;
    select coalesce(max(position), 0) + 1 into v_position from public.project_tasks where project_id = v_prop.project_id;

    insert into public.project_tasks (project_id, title, status, owner_person_id, assignee_side, due_date, evidence_ref, position)
    values (v_prop.project_id, trim(v_payload->>'title'), 'todo', v_owner, v_side, v_task_due,
            nullif(trim(v_payload->>'evidence_ref'),''), v_position)
    returning * into v_task;
    v_applied_task_id := v_task.id;

    -- El seguimiento se muda a la sala: el action_item origen se cierra.
    begin v_action_item_id := nullif(v_payload->>'action_item_id','')::uuid; exception when others then v_action_item_id := null; end;
    if v_action_item_id is not null then
      update public.action_items
        set status = 'resolved', resolved_at = now(), resolved_reason = 'promoted_to_task'
        where id = v_action_item_id and status <> 'resolved';
    end if;

  elsif v_kind in ('update_item','resolve_item') then
    if v_prop.target_item_id is null then raise exception '% requires a target item', v_kind; end if;
    select * into v_item from public.project_state_items where id = v_prop.target_item_id and project_id = v_prop.project_id for update;
    if not found then raise exception 'target state item not found'; end if;
    v_status := nullif(trim(v_payload->>'status'),'');
    if v_kind = 'resolve_item' then
      v_status := coalesce(v_status, 'resolved');
      if v_status not in ('resolved','superseded','unknown','expired') then raise exception 'invalid resolve status %', v_status; end if;
    elsif v_status is not null and v_status not in ('active','resolved','superseded','unknown','expired') then raise exception 'invalid update status %', v_status; end if;
    begin v_due := nullif(v_payload->>'due_at','')::timestamptz; exception when others then v_due := null; end;
    v_merged_refs := array(select distinct e from unnest(coalesce(v_item.source_refs,'{}') || coalesce(v_prop.source_refs,'{}')) as e);
    update public.project_state_items set
      status = coalesce(v_status, status),
      owner_label = coalesce(nullif(trim(v_payload->>'owner_label'),''), owner_label),
      stakeholder_label = coalesce(nullif(trim(v_payload->>'stakeholder_label'),''), stakeholder_label),
      due_at = coalesce(v_due, due_at),
      resolution_note = coalesce(nullif(trim(v_payload->>'resolution_note'),''), resolution_note),
      last_confirmed_at = case when v_kind = 'update_item' and v_status = 'active' then now() else last_confirmed_at end,
      source_refs = v_merged_refs, updated_by = p_actor, updated_at = now()
    where id = v_item.id returning * into v_item;
    v_applied_item_id := v_item.id;
  elsif v_kind = 'state_summary' then
    v_health := nullif(trim(v_payload->>'health'),'');
    if v_health is not null and v_health not in ('on_track','watch','blocked','paused','unknown') then raise exception 'invalid health %', v_health; end if;
    insert into public.project_states (project_id, current_summary, current_phase, current_focus, health, updated_by, last_state_change_at, updated_at)
    values (v_prop.project_id, nullif(trim(v_payload->>'current_summary'),''), nullif(trim(v_payload->>'current_phase'),''), nullif(trim(v_payload->>'current_focus'),''), coalesce(v_health, 'unknown'), p_actor, now(), now())
    on conflict (project_id) do update set
      current_summary = coalesce(nullif(trim(v_payload->>'current_summary'),''), public.project_states.current_summary),
      current_phase = coalesce(nullif(trim(v_payload->>'current_phase'),''), public.project_states.current_phase),
      current_focus = coalesce(nullif(trim(v_payload->>'current_focus'),''), public.project_states.current_focus),
      health = coalesce(v_health, public.project_states.health), updated_by = p_actor, last_state_change_at = now(), updated_at = now()
    returning * into v_state;
  elsif v_kind = 'add_learning' then
    v_learning_type := coalesce(nullif(trim(v_payload->>'learning_type'),''), 'implementation_question');
    if v_learning_type not in ('implementation_question','stakeholder_need','friction','decision_pattern','operating_pattern','outcome') then raise exception 'invalid learning_type %', v_learning_type; end if;
    if nullif(trim(v_payload->>'title'),'') is null or nullif(trim(v_payload->>'observation'),'') is null then raise exception 'add_learning requires a title and observation'; end if;
    insert into public.project_learning_items (project_id, learning_type, area, title, observation, implication, status, transferability, confidence, source_refs, last_seen_at, stale_after, created_by, updated_by)
    values (v_prop.project_id, v_learning_type, nullif(trim(v_payload->>'area'),''), trim(v_payload->>'title'), trim(v_payload->>'observation'), nullif(trim(v_payload->>'implication'),''), 'observed', 'project', v_prop.confidence, coalesce(v_prop.source_refs,'{}'), now(), now() + interval '45 days', p_actor, p_actor)
    returning * into v_learning;
    v_applied_learning_id := v_learning.id;
  else raise exception 'invalid proposal_kind %', v_kind; end if;

  if v_state.project_id is null then select * into v_state from public.project_states where project_id = v_prop.project_id; end if;
  v_snapshot := jsonb_build_object('proposal_kind', v_kind,
    'state', case when v_state.project_id is not null then to_jsonb(v_state) else null end,
    'applied_item', case when v_item.id is not null then to_jsonb(v_item) else null end,
    'applied_learning', case when v_learning.id is not null then to_jsonb(v_learning) else null end,
    'applied_task', case when v_task.id is not null then to_jsonb(v_task) else null end);

  insert into public.project_state_revisions (project_id, action, actor, snapshot, note)
  values (v_prop.project_id, 'system_refresh', p_actor, v_snapshot, format('Accepted proposal %s: %s', v_prop.id, v_prop.summary))
  returning id into v_revision_id;

  update public.project_state_proposals set
    status = 'accepted', reviewed_by = p_actor, reviewed_at = now(),
    applied_item_id = v_applied_item_id, applied_learning_id = v_applied_learning_id,
    applied_task_id = v_applied_task_id,
    applied_revision_id = v_revision_id, updated_at = now()
  where id = p_proposal_id returning * into v_prop;
  return v_prop;
end; $function$;
