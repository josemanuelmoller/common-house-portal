-- BLK-0 — metadata de reunión en sources.
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-25 (recorded version 20260725101524, name blk0_source_meeting_meta)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. Both statements
-- use IF NOT EXISTS, so re-running is safe.

-- Metadata de reunión en sources: duración y asistentes (de Fireflies).
-- Nullable: solo las reuniones capturadas la tienen; correos/huecos quedan NULL.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS duration_minutes numeric;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS attendees text[];
