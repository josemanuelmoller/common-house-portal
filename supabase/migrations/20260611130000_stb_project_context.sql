-- Suggested Time Blocks — project / objective context chip.
-- Every block should answer "which project does this hang from, and what
-- tier of the plan does that project serve?" at a glance.
-- Resolution happens at generation time (src/lib/project-context.ts):
-- explicit FK linkage when the source row carries it, conservative
-- name inference otherwise. NULLs mean "could not resolve honestly".

alter table public.suggested_time_blocks
  add column if not exists project_name    text,
  add column if not exists objective_title text,
  add column if not exists objective_tier  text,
  add column if not exists project_source  text
    check (project_source in ('explicit', 'inferred'));
