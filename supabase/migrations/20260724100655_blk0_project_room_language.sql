-- BLK-0 — idioma de la sala.
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-24 (recorded version 20260724100655, name blk0_project_room_language)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. `add column if
-- not exists` makes it idempotent (the inline CHECK is skipped along with the
-- column when it already exists, which is the live state).

alter table public.projects
  add column if not exists room_language text not null default 'es'
  check (room_language in ('es','en'));
