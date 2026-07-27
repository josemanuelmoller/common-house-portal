-- Portal 2.0 — una propuesta sólo puede estar en la bandeja si se puede aplicar.
--
-- `project_state_proposals` tiene cuatro escritores y sólo uno valida:
--
--   job:state-refresh    165 filas · src/lib/state-refresh.ts → normalizeProposal.
--                        Valida todo. 0 inaplicables. Correcto.
--   propose-room-tasks    60 filas · proposal_kind 'add_task'. NO existe en este
--                        repo. Escribe bien: payload.title en 60/60, y su única
--                        fila aceptada tiene applied_revision_id → el RPC la
--                        aplicó de verdad contra project_tasks.
--   room-empty-state       0 filas · /api/rooms/[projectId]/structure. Registro
--                        de auditoría ('room_structure'), insertado ya 'accepted'
--                        y que el RPC nunca aplica.
--   room-meeting-agent     3 filas · tampoco existe en este repo. Escribe directo
--                        contra PostgREST: payload '{}' en 3/3, source_refs con
--                        texto humano ("Catch up · 21 Jul") en vez de UUIDs de
--                        evidencia, e item_type fuera del enum ('task','status').
--
-- Ninguna de esas 3 se aplicó nunca — las tres tienen applied_revision_id null,
-- porque apply_state_proposal las habría rechazado. Pero el botón Confirmar viejo
-- (anterior a PR #111) las marcaba 'accepted' a mano, así que dos llegaron a la
-- bandeja del PM, se confirmaron, y no cambiaron nada.
--
-- Esto se corta en la tabla y no en el llamador a propósito: dos de los cuatro
-- escritores no tienen código en este repo, así que ninguna guarda en TypeScript
-- podría haberlos frenado. La constraint es lo único que los alcanza a todos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El test de trazabilidad de source_refs.
--
-- Los kinds que alimentan project_state_items.source_refs / project_learning_items
-- .source_refs guardan ahí IDs de public.evidence, y ese es el único enlace que
-- deja una afirmación de estado con su prueba. "Catch up · 21 Jul" no resuelve a
-- nada: rompe la garantía source-preserving del job.
--
-- Función y no expresión suelta porque el test se usa en cinco ramas de la
-- constraint, y porque una CHECK no admite subconsultas (unnest + not exists
-- queda descartado); array_to_string mantiene el test libre de subconsultas.
-- 'add_task' queda fuera a propósito: sus refs son 'fireflies:<uuid>' y viajan a
-- project_tasks.evidence_ref, que es texto namespaced, no un ID de evidencia.
create or replace function public.state_proposal_refs_are_evidence_ids(p_refs text[])
returns boolean
language sql
immutable
parallel safe
as $$
  -- Un solo literal a propósito: los UUIDs no llevan comas, así que unirlos y
  -- comparar la cadena entera evita el unnest + subconsulta que una CHECK prohíbe.
  select array_to_string(coalesce(p_refs, '{}'), ',') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$';
$$;

comment on function public.state_proposal_refs_are_evidence_ids(text[]) is
  'True si source_refs trae al menos un ref y todos son UUIDs de public.evidence. Usada por project_state_proposals_applicable para los kinds cuyo source_refs se copia a un state item o learning item. No aplica a add_task (refs namespaced hacia project_tasks.evidence_ref).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cerrar las 3 filas que nunca se van a poder aplicar.
--
-- Tiene que pasar ANTES del ADD CONSTRAINT: aunque la constraint queda acotada a
-- 'pending' y estas tres ya son terminales, dejarlas sin nota las mantiene
-- indistinguibles de una revisión real en el historial. 'accepted' es falso en
-- los datos — applied_revision_id es null en las tres.
-- La nota dice sólo lo que es cierto de las tres: dos traen item_type fuera del
-- enum ('status', 'task') pero d83c9918 trae 'decision', que sí es válido —
-- igual de inaplicable, porque el payload vacío ya la condena.
update public.project_state_proposals
   set status      = 'rejected',
       review_note = 'Inaplicable: payload vacío y source_refs sin IDs de evidencia. '
                     || 'Escrita sin pasar por el validador de propuestas. '
                     || 'Nunca se aplicó (applied_revision_id null); el "accepted" '
                     || 'venía del botón Confirmar anterior a PR #111.',
       reviewed_at = coalesce(reviewed_at, now()),
       updated_at  = now()
 where id in (
         'd83c9918-168a-4a64-90d5-7f184271a588',
         'c72254f4-38a7-4206-8514-25dd37c210d6',
         '2bcb3964-03fd-44a1-82dd-adf0f27cb004'
       )
   and applied_revision_id is null
   and review_note is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La puerta.
--
-- Espeja exactamente lo que apply_state_proposal exige por kind — ni más ni
-- menos, para que la constraint nunca rechace algo que el RPC sí sabía aplicar:
--   add_item      → statement + item_type dentro del enum de state items
--   update_item   → target + al menos un campo que cambiar (si no, es un no-op
--                   que le dice al PM que algo pasó cuando no pasó nada)
--   resolve_item  → target; el RPC asume 'resolved' si el payload no trae status
--   state_summary → al menos un campo que cambiar
--   add_learning  → title + observation
--   add_task      → title + assignee_side válido. Son las dos únicas cosas por
--                   las que la rama add_task del RPC levanta excepción ("el
--                   título es lo único obligatorio"; assignee_side cae a 'team'
--                   si viene vacío, pero un valor fuera de ('team','client')
--                   aborta). El resto del payload se coacciona a null.
--   otros         → pasan ('room_structure' y futuros registros de auditoría)
--
-- Acotada a 'pending' por dos razones, no una:
--   * cubre todo el camino de escritura igual — todo lo que llega a la bandeja
--     se inserta 'pending'. La única inserción que no lo es (el registro
--     'room_structure', que nace 'accepted') cae además en el else;
--   * una CHECK se reevalúa en UPDATE. Sin acotar, cualquier fila histórica que
--     la viole queda congelada: no se podría ni rechazar. Acotando a 'pending',
--     cerrar una propuesta siempre sigue siendo posible.
alter table public.project_state_proposals
  drop constraint if exists project_state_proposals_applicable;

alter table public.project_state_proposals
  add constraint project_state_proposals_applicable check (
    status <> 'pending'
    or case proposal_kind
      when 'add_item' then
        nullif(trim(payload->>'statement'), '') is not null
        and coalesce(nullif(trim(item_type), ''), nullif(trim(payload->>'item_type'), '')) in (
          'decision', 'commitment', 'risk', 'dependency', 'question',
          'milestone', 'stakeholder_signal', 'assumption', 'outcome'
        )
        and public.state_proposal_refs_are_evidence_ids(source_refs)
      when 'update_item' then
        target_item_id is not null
        and coalesce(
          nullif(trim(payload->>'status'), ''),
          nullif(trim(payload->>'owner_label'), ''),
          nullif(trim(payload->>'stakeholder_label'), ''),
          nullif(trim(payload->>'due_at'), ''),
          nullif(trim(payload->>'resolution_note'), '')
        ) is not null
        and public.state_proposal_refs_are_evidence_ids(source_refs)
      when 'resolve_item' then
        target_item_id is not null
        and public.state_proposal_refs_are_evidence_ids(source_refs)
      when 'state_summary' then
        coalesce(
          nullif(trim(payload->>'current_summary'), ''),
          nullif(trim(payload->>'current_phase'), ''),
          nullif(trim(payload->>'current_focus'), ''),
          nullif(trim(payload->>'health'), '')
        ) is not null
        and public.state_proposal_refs_are_evidence_ids(source_refs)
      when 'add_learning' then
        nullif(trim(payload->>'title'), '') is not null
        and nullif(trim(payload->>'observation'), '') is not null
        and public.state_proposal_refs_are_evidence_ids(source_refs)
      when 'add_task' then
        nullif(trim(payload->>'title'), '') is not null
        and coalesce(nullif(trim(payload->>'assignee_side'), ''), 'team') in ('team', 'client')
      else true
    end
  );

comment on constraint project_state_proposals_applicable on public.project_state_proposals is
  'Una propuesta pendiente tiene que poder aplicarse: espeja los requisitos de apply_state_proposal por kind. Impide que una propuesta inaplicable (payload vacío, sin target, item_type fuera del enum, source_refs sin IDs de evidencia) llegue a la bandeja del PM, donde sólo puede fallar con 400 o aplicarse como un no-op silencioso. Los kinds de auditoría (room_structure) pasan sin condiciones. Si una rama de apply_state_proposal gana o pierde un campo obligatorio, hay que actualizar esta constraint y proposalRejectionReason() en src/lib/state-proposal-insert.ts.';
