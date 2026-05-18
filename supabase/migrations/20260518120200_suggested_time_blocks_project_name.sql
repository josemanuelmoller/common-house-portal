-- Cache the parent project name on each suggested time block so the
-- cards in SuggestedTimeBlocks can always disclose project context.
-- Owner rule (2026-05-18): "tienen que ser explícitos los temas con el
-- proyecto al que se relacionan". Null means "(sin proyecto)" — never
-- duplicate the title.

ALTER TABLE public.suggested_time_blocks
  ADD COLUMN IF NOT EXISTS project_name text NULL;

COMMENT ON COLUMN public.suggested_time_blocks.project_name IS
  'Parent project name for the underlying entity (loop.parent_project_name '
  'when entity_type=loop). Cached at insert time. NULL renders as "(sin proyecto)".';
