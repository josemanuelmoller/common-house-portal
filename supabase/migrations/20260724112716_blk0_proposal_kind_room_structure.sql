-- BLK-0 — 'room_structure' joins the proposal kinds
--
-- /api/rooms/[projectId]/structure records the empty-state gate (the PM approving
-- the initial phases + deliverables of a room) as an already-'accepted' row in
-- project_state_proposals. That needed a sixth kind.
--
-- It is an AUDIT row, not a proposal: it is never 'pending', and
-- apply_state_proposal deliberately does not know the kind (it would raise
-- 'invalid proposal_kind'), because the route has already materialised the
-- structure by the time it writes this.
--
-- RECONSTRUCTED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-24 (recorded version 20260724112716, name blk0_proposal_kind_room_structure)
-- without a companion file in the repo. The file is written here so the repo can
-- still reproduce prod from scratch; the statement below is idempotent and matches
-- the live constraint definition exactly.

alter table public.project_state_proposals
  drop constraint if exists project_state_proposals_proposal_kind_check;

alter table public.project_state_proposals
  add constraint project_state_proposals_proposal_kind_check check (
    proposal_kind in (
      'add_item', 'update_item', 'resolve_item', 'state_summary', 'add_learning',
      'room_structure'
    )
  );
