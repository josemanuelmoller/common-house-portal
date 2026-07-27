-- Un resumen de estado pendiente por proyecto: el nuevo reemplaza al anterior.
--
-- `state_summary` describe "cómo está el proyecto AHORA" — resumen, fase, foco,
-- salud. A diferencia de un add_item, que agrega una afirmación nueva a una
-- lista, cada state_summary es una versión completa del mismo objeto. Dos
-- pendientes del mismo proyecto no son dos cosas por decidir: son la misma
-- decisión, y sólo la última tiene sentido.
--
-- Se apilaban porque nada los relacionaba entre sí. El dedupe de state-refresh
-- compara texto con similitud trigram, y dos resúmenes redactados en semanas
-- distintas no se parecen lo suficiente aunque describan el mismo proyecto:
-- iRefill acumuló 5 pendientes (17→23 jul) y Reuse for All 4. De 20 pendientes,
-- 11 estaban superadas — el 55% de esa bandeja era ruido que el PM tenía que
-- descartar a mano para llegar a la única que importaba.
--
-- Va dentro de commit_state_proposals y no en el código del job por dos razones:
-- pasa en la misma transacción que la inserción y el avance del cursor, así que
-- no existe el estado intermedio con dos pendientes; y vincula a cualquier
-- escritor futuro, incluidos los que postean directo contra PostgREST sin pasar
-- por este repo (mismo criterio que project_state_proposals_applicable).

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
declare v_cur public.project_evidence_cursors; v_e jsonb; v_count integer := 0;
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
    -- El resumen entrante deja obsoleto a cualquier resumen pendiente anterior
    -- del mismo proyecto. Se cierran como 'rejected' con la razón escrita, no se
    -- borran: el historial de qué propuso el job y cuándo se conserva entero.
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
  'Inserta propuestas y avanza el cursor de evidencia en una transacción, bajo advisory lock + chequeo optimista. Un state_summary entrante cierra los state_summary pendientes anteriores del mismo proyecto: describen el mismo objeto, y sólo el último es aplicable.';

-- Limpieza de lo ya apilado: por proyecto se conserva el más reciente.
with ranked as (
  select id, row_number() over (partition by project_id order by created_at desc, id desc) as rn
  from public.project_state_proposals
  where status = 'pending' and proposal_kind = 'state_summary'
)
update public.project_state_proposals p
   set status      = 'rejected',
       review_note = 'Superada por un resumen de estado más nuevo del mismo proyecto (limpieza 2026-07-28).',
       reviewed_by = 'job:state-refresh',
       reviewed_at = now(),
       updated_at  = now()
  from ranked r
 where p.id = r.id and r.rn > 1;
