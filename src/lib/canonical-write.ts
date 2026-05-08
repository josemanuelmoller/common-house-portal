/**
 * canonical-write.ts — direct write helpers for the canonical Supabase tables
 * that replaced the deprecated `notion_*` mirror layer.
 *
 * Background: pre-2026-05-05 the codebase wrote to mirror tables (with a
 * `pending_notion_push` payload) and a cron drained pushes back to Notion.
 * That pattern was rejected (see docs/migration/REJECTED_PATTERNS.md R-001)
 * and the mirror push is being decommissioned ahead of the
 * 2026-06-02 Notion freeze cutoff.
 *
 * These helpers are the canonical replacement: callers write directly to the
 * Supabase canonical table. No Notion side-effect, no mirror row, no pending
 * payload.
 *
 * Field-name mapping where the old mirror-push API differed from the canonical
 * table column names is preserved here so callers that still pass
 * `draft_text` keep working until they're refactored.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Legacy mirror-table name accepted as input for back-compat. */
export type LegacyMirrorTable =
  | "notion_decision_items"
  | "notion_daily_briefings"
  | "notion_insight_briefs"
  | "notion_competitive_intel"
  | "notion_agent_drafts"
  | "notion_content_pipeline"
  | "notion_watchlist";

/** Canonical Supabase table that replaces each legacy mirror table. */
export type CanonicalTable =
  | "decision_items"
  | "daily_briefings"
  | "insight_briefs"
  | "competitive_intel"
  | "agent_drafts"
  | "content_pipeline_items"
  | "watchlist_entities";

const LEGACY_TO_CANONICAL: Record<LegacyMirrorTable, CanonicalTable> = {
  notion_decision_items:    "decision_items",
  notion_daily_briefings:   "daily_briefings",
  notion_insight_briefs:    "insight_briefs",
  notion_competitive_intel: "competitive_intel",
  notion_agent_drafts:      "agent_drafts",
  notion_content_pipeline:  "content_pipeline_items",
  notion_watchlist:         "watchlist_entities",
};

function resolveTable(t: LegacyMirrorTable | CanonicalTable): CanonicalTable {
  return (LEGACY_TO_CANONICAL as Record<string, CanonicalTable>)[t] ?? (t as CanonicalTable);
}

function applyFieldRenames(table: CanonicalTable, fields: Record<string, unknown>): Record<string, unknown> {
  const f = { ...fields };
  // Legacy callers pass `draft_text`; canonical schema uses `body_md`.
  if ("draft_text" in f && !("body_md" in f)) {
    f.body_md = f.draft_text;
    delete f.draft_text;
  }
  // canonical agent_drafts requires body_md NOT NULL
  if (table === "agent_drafts" && !f.body_md) f.body_md = "";
  return f;
}

/**
 * Insert a new row into the canonical Supabase table corresponding to the
 * given legacy/canonical name. Returns the new row id on success.
 */
export async function createCanonicalRow(params: {
  table: LegacyMirrorTable | CanonicalTable;
  fields: Record<string, unknown>;
}): Promise<{ ok: boolean; id?: string | null; error?: string }> {
  const target = resolveTable(params.table);
  const fields = applyFieldRenames(target, params.fields);

  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb.from(target).insert(fields).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: (data?.id as string | null) ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Update a row in the canonical Supabase table by id. Returns ok:true on
 * success. Replaces the deprecated `applyMirrorEdit` no-op.
 */
export async function updateCanonicalRow(params: {
  table: LegacyMirrorTable | CanonicalTable;
  id: string;
  changes: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const target = resolveTable(params.table);
  const changes = applyFieldRenames(target, params.changes);

  try {
    const sb = getSupabaseServerClient();
    const { error } = await sb.from(target).update(changes).eq("id", params.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
