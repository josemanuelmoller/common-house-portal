-- Una propuesta que no se puede aplicar no debería llegar a la bandeja del PM.
--
-- `project_state_proposals` tiene tres escritores y sólo uno valida:
--   job:state-refresh  → pasa por toProposalInsert (src/lib/state-refresh.ts).
--                        165 filas, 0 inaplicables. Correcto.
--   room-empty-state   → registro de auditoría del gate de estructura
--                        (proposal_kind 'room_structure'), que el RPC nunca aplica.
--   room-meeting-agent → escribe directo. 3 filas, 3 inaplicables: payload vacío,
--                        source_refs con texto humano en vez de UUIDs de evidencia,
--                        e item_type fuera del enum ('task', 'status').
--
-- Ninguna de esas tres se aplicó nunca: `apply_state_proposal` las habría
-- rechazado. Pero el botón Confirmar viejo las marcaba 'accepted' igual, así que
-- llegaron a la bandeja, se confirmaron y se perdieron sin cambiar nada.
--
-- La constraint corta el problema en la raíz en vez de en cada llamador: no
-- importa qué código escriba, la fila inaplicable no entra.

-- 1. Las filas existentes. 'accepted' es falso en los datos — nunca se aplicaron
--    (applied_revision_id null). Quedan rejected con la razón escrita.
update public.project_state_proposals
   set status      = 'rejected',
       review_note = concat(
         'Inaplicable: payload vacío y/o item_type fuera del enum. ',
         'Escrita sin pasar por el validador de state-refresh. ',
         'Nunca se aplicó (applied_revision_id null).'
       ),
       reviewed_at = coalesce(reviewed_at, now()),
       updated_at  = now()
 where coalesce(payload, '{}'::jsonb) = '{}'::jsonb
   and applied_revision_id is null
   and proposal_kind in ('add_item', 'update_item', 'state_summary', 'add_learning');

-- 2. La puerta. Sólo se exige lo que `apply_state_proposal` realmente necesita
--    para cada kind, para no ser más estricto que el RPC:
--      add_item      → statement + item_type dentro del enum de state items
--      update_item   → algún campo que actualizar (si no, es un no-op)
--      state_summary → algún campo que cambiar
--      add_learning  → title + observation
--      resolve_item  → nada: el RPC asume 'resolved' cuando el payload no trae status
--      cualquier otro ('room_structure' y futuros registros de auditoría) → pasa
--
-- 'rejected' queda exento a propósito: es el cementerio, y tiene que poder
-- guardar lo malformado que ya pasó — incluidas las filas que limpia el paso 1.
alter table public.project_state_proposals
  add constraint project_state_proposals_applicable check (
    status = 'rejected'
    or case proposal_kind
      when 'add_item' then
        coalesce(coalesce(payload, '{}'::jsonb) ->> 'statement', '') <> ''
        and coalesce(item_type, coalesce(payload, '{}'::jsonb) ->> 'item_type') in (
          'decision', 'commitment', 'risk', 'dependency', 'question',
          'milestone', 'stakeholder_signal', 'assumption', 'outcome'
        )
      when 'update_item' then
        coalesce(payload, '{}'::jsonb) <> '{}'::jsonb
      when 'state_summary' then
        coalesce(payload, '{}'::jsonb) <> '{}'::jsonb
      when 'add_learning' then
        coalesce(coalesce(payload, '{}'::jsonb) ->> 'title', '') <> ''
        and coalesce(coalesce(payload, '{}'::jsonb) ->> 'observation', '') <> ''
      else true
    end
  );

comment on constraint project_state_proposals_applicable on public.project_state_proposals is
  'Una propuesta viva tiene que poder aplicarse: espeja los requisitos de apply_state_proposal por kind. Los kinds de auditoría (room_structure) y las rechazadas pasan sin condiciones.';
