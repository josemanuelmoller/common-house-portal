-- Suggested Time Blocks v2 — evidence-backed scheduling.
--
-- 1. action_items.effort — estimated work size, set at ingest time by the
--    Fireflies/Gmail classifiers (or heuristic fallback). Drives whether a
--    commitment earns a Suggested Time Block (session/focused) or stays in
--    the Commitments ledger only (quick).
-- 2. suggested_time_blocks check constraints widened for the new
--    commitment-backed block types ('commitment', 'quick_batch').

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS effort text
  CHECK (effort IN ('quick', 'focused', 'session'));

COMMENT ON COLUMN public.action_items.effort IS
  'Estimated work size: quick (<=15min, dispatch from inbox), focused (30-60min), session (90min+ production work). NULL = not yet classified; readers fall back to intent-based heuristic.';

ALTER TABLE public.suggested_time_blocks
  DROP CONSTRAINT IF EXISTS suggested_time_blocks_linked_entity_type_check;
ALTER TABLE public.suggested_time_blocks
  ADD CONSTRAINT suggested_time_blocks_linked_entity_type_check
  CHECK (linked_entity_type IN (
    'loop', 'opportunity', 'project', 'meeting_prep', 'meeting_follow_up',
    'commitment', 'quick_batch'
  ));

ALTER TABLE public.suggested_time_blocks
  DROP CONSTRAINT IF EXISTS suggested_time_blocks_task_type_check;
ALTER TABLE public.suggested_time_blocks
  ADD CONSTRAINT suggested_time_blocks_task_type_check
  CHECK (task_type IN (
    'deep_work', 'follow_up', 'prep', 'decision', 'admin', 'commitment'
  ));
