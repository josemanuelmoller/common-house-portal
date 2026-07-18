-- Portal 2.0 — atomic + idempotent commit for the state-refresh job.
--
-- Two failure modes this closes:
--  1) concurrent runs both read the same cursor, both call the model, both insert
--     → duplicate proposals;
--  2) a run inserts proposals then crashes before advancing the cursor
--     → next run re-reads the same evidence and re-proposes.
--
-- Fix: insert proposals AND advance the cursor in ONE transaction, guarded by a
-- per-project advisory xact lock (serializes the commit) and an optimistic cursor
-- check (the caller passes the cursor it read; if it moved, we abort without
-- inserting). The LLM call stays OUTSIDE this transaction, so the lock is held
-- only for the fast commit. Proposals arrive already deduped/capped by the caller.

create or replace function public.commit_state_proposals(
  p_project_id uuid,
  p_expected_cursor_at timestamptz,
  p_expected_cursor_id uuid,
  p_next_cursor_at timestamptz,
  p_next_cursor_id uuid,
  p_proposals jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur public.project_evidence_cursors;
  v_e jsonb;
  v_count integer := 0;
begin
  -- Serialize commits for this project (held only for this fast transaction).
  perform pg_advisory_xact_lock(hashtext('state-refresh:' || p_project_id::text)::bigint);

  select * into v_cur from public.project_evidence_cursors
   where project_id = p_project_id for update;
  if found then
    -- Cursor advanced since the caller read it → another run handled this delta.
    if v_cur.cursor_updated_at is distinct from p_expected_cursor_at
       or v_cur.cursor_id is distinct from p_expected_cursor_id then
      raise exception 'cursor moved since read (concurrent run); aborting to avoid duplicates'
        using errcode = '55000';
    end if;
  end if;
  -- No row = first run for this project; proceed and create the cursor below.

  for v_e in select * from jsonb_array_elements(coalesce(p_proposals, '[]'::jsonb))
  loop
    insert into public.project_state_proposals (
      project_id, proposal_kind, target_item_id, item_type, summary, rationale,
      impact, confidence, source_refs, payload, status,
      evidence_window_start, evidence_window_end, generated_by, model
    ) values (
      p_project_id,
      v_e->>'proposal_kind',
      nullif(v_e->>'target_item_id','')::uuid,
      nullif(v_e->>'item_type',''),
      v_e->>'summary',
      v_e->>'rationale',
      coalesce(nullif(v_e->>'impact',''), 'medium'),
      coalesce((v_e->>'confidence')::int, 50),
      coalesce(array(select jsonb_array_elements_text(v_e->'source_refs')), '{}'),
      coalesce(v_e->'payload', '{}'::jsonb),
      'pending',
      nullif(v_e->>'evidence_window_start','')::timestamptz,
      nullif(v_e->>'evidence_window_end','')::timestamptz,
      coalesce(nullif(v_e->>'generated_by',''), 'job:state-refresh'),
      nullif(v_e->>'model','')
    );
    v_count := v_count + 1;
  end loop;

  insert into public.project_evidence_cursors (project_id, cursor_updated_at, cursor_id, last_run_at, batches_processed, updated_at)
  values (p_project_id, p_next_cursor_at, p_next_cursor_id, now(), 1, now())
  on conflict (project_id) do update set
    cursor_updated_at = excluded.cursor_updated_at,
    cursor_id = excluded.cursor_id,
    last_run_at = now(),
    batches_processed = public.project_evidence_cursors.batches_processed + 1,
    updated_at = now();

  return v_count;
end;
$$;

revoke all on function public.commit_state_proposals(uuid, timestamptz, uuid, timestamptz, uuid, jsonb) from public;
revoke all on function public.commit_state_proposals(uuid, timestamptz, uuid, timestamptz, uuid, jsonb) from anon;
revoke all on function public.commit_state_proposals(uuid, timestamptz, uuid, timestamptz, uuid, jsonb) from authenticated;
grant execute on function public.commit_state_proposals(uuid, timestamptz, uuid, timestamptz, uuid, jsonb) to service_role;

comment on function public.commit_state_proposals(uuid, timestamptz, uuid, timestamptz, uuid, jsonb) is
  'Atomically inserts already-deduped/capped proposals and advances the evidence cursor for a project, under a per-project advisory lock + optimistic cursor check. Prevents duplicate proposals from concurrent runs or a crash between insert and cursor advance.';
