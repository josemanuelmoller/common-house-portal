-- Una propuesta puede declarar que reemplaza a otra pendiente.
--
-- Complemento de 20260728090000, que resolvió el mismo problema sólo para
-- state_summary y por regla fija (el nuevo tapa al anterior, siempre). Acá el
-- caso es más general y no se puede decidir por tipo: dos add_item del mismo
-- proyecto normalmente son dos afirmaciones distintas, pero a veces el segundo
-- corrige al primero — "la máquina llega en mayo" seguido de "se retrasó a
-- agosto". Quién reemplaza a quién sólo lo sabe quien leyó la evidencia nueva.
--
-- Por eso lo declara el generador: state-refresh ahora ve su propia cola
-- pendiente en el prompt (P-labels) y puede marcar `supersedes`. La P-label se
-- traduce a uuid en el servidor — el modelo nunca ve ni escribe uuids, misma
-- regla que las A/E labels.
--
-- El cierre va acá y no en el job por lo mismo que el resto: pasa en la
-- transacción que inserta y avanza el cursor, así que no existe el instante en
-- que la nueva y la obsoleta están las dos pendientes.

create or replace function public.commit_state_proposals(
  p_project_id uuid,
  p_expected_cursor_at timestamp with time zone,
  p_expected_cursor_id uuid,
  p_next_cursor_at timestamp with time zone,
  p_next_cursor_id uuid,
  p_proposals jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cur public.project_evidence_cursors; v_e jsonb; v_count integer := 0; v_sup uuid;
begin
  perform pg_advisory_xact_lock(hashtext('state-refresh:' || p_project_id::text)::bigint);
  select * into v_cur from public.project_evidence_cursors where project_id = p_project_id for update;
  if found then
    if v_cur.cursor_updated_at is distinct from p_expected_cursor_at or v_cur.cursor_id is distinct from p_expected_cursor_id then
      raise exception 'cursor moved since read (concurrent run); aborting to avoid duplicates' using errcode = '55000';
    end if;
  end if;

  for v_e in select * from jsonb_array_elements(coalesce(p_proposals, '[]'::jsonb))
  loop
    -- Regla por tipo: un resumen de estado tapa a los resúmenes pendientes.
    if v_e->>'proposal_kind' = 'state_summary' then
      update public.project_state_proposals
         set status      = 'rejected',
             review_note = 'Superada automáticamente por un resumen de estado más nuevo del mismo proyecto.',
             reviewed_by = 'job:state-refresh',
             reviewed_at = now(),
             updated_at  = now()
       where project_id = p_project_id
         and proposal_kind = 'state_summary'
         and status = 'pending';
    end if;

    -- Regla declarada: la propuesta dice a cuál pendiente deja obsoleta.
    -- Acotado al mismo proyecto y a 'pending' a propósito: nada puede cerrar
    -- una propuesta ya revisada, ni tocar la cola de otro proyecto.
    v_sup := nullif(v_e->>'supersedes_proposal_id', '')::uuid;
    if v_sup is not null then
      update public.project_state_proposals
         set status      = 'rejected',
             review_note = 'Superada por una propuesta más nueva sobre lo mismo, con evidencia posterior.',
             reviewed_by = 'job:state-refresh',
             reviewed_at = now(),
             updated_at  = now()
       where id = v_sup
         and project_id = p_project_id
         and status = 'pending';
    end if;

    insert into public.project_state_proposals (
      project_id, proposal_kind, target_item_id, item_type, summary, rationale,
      impact, confidence, source_refs, payload, status,
      evidence_window_start, evidence_window_end, generated_by, model
    ) values (
      p_project_id, v_e->>'proposal_kind', nullif(v_e->>'target_item_id','')::uuid, nullif(v_e->>'item_type',''),
      v_e->>'summary', v_e->>'rationale', coalesce(nullif(v_e->>'impact',''), 'medium'),
      coalesce((v_e->>'confidence')::int, 50),
      coalesce(array(select jsonb_array_elements_text(v_e->'source_refs')), '{}'),
      coalesce(v_e->'payload', '{}'::jsonb), 'pending',
      nullif(v_e->>'evidence_window_start','')::timestamptz, nullif(v_e->>'evidence_window_end','')::timestamptz,
      coalesce(nullif(v_e->>'generated_by',''), 'job:state-refresh'), nullif(v_e->>'model','')
    );
    v_count := v_count + 1;
  end loop;

  insert into public.project_evidence_cursors (project_id, cursor_updated_at, cursor_id, last_run_at, batches_processed, updated_at)
  values (p_project_id, p_next_cursor_at, p_next_cursor_id, now(), 1, now())
  on conflict (project_id) do update set
    cursor_updated_at = excluded.cursor_updated_at, cursor_id = excluded.cursor_id,
    last_run_at = now(), batches_processed = public.project_evidence_cursors.batches_processed + 1, updated_at = now();
  return v_count;
end; $function$;

comment on function public.commit_state_proposals(uuid, timestamptz, uuid, timestamptz, uuid, jsonb) is
  'Inserta propuestas y avanza el cursor en una transacción, bajo advisory lock + chequeo optimista. Cierra la cola obsoleta de dos formas: un state_summary entrante tapa a los state_summary pendientes del proyecto, y cualquier propuesta puede declarar supersedes_proposal_id para cerrar la pendiente que su evidencia deja atrás.';
