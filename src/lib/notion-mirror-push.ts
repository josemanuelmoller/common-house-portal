// DEPRECATED: scheduled for deletion at Phase 6 cutoff 2026-06-02. See docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.7. Functions here are no-ops; the canonical Supabase write happens at the call site upstream.
/**
 * Phase 2 — reverse sync: push portal edits from Supabase mirrors back to Notion.
 *
 * NOTE (2026-05-05): all functions in this file are now no-ops. The mirror
 * tables (`notion_decision_items`, `notion_daily_briefings`,
 * `notion_insight_briefs`, `notion_competitive_intel`) are scheduled for
 * `DROP` at Phase 6 (2026-06-02) and Notion becomes a read-only archive at
 * the same cutoff. Callers should write directly to the canonical Supabase
 * tables (`decision_items`, `daily_briefings`, etc.) instead.
 *
 * The original behavior is preserved as commented-out code with a
 * `notion-cutoff-2026-06-02` marker so a Phase 6 sweep can confirm and
 * delete the file.
 */

// notion-cutoff-2026-06-02: removed; mirror is dropped at Phase 6
// import { notion } from "@/lib/notion/core";
// import { getSupabaseServerClient } from "@/lib/supabase-server";

type MirrorTable =
  | "notion_decision_items"
  | "notion_daily_briefings"
  | "notion_insight_briefs"
  | "notion_competitive_intel";

/**
 * Apply a portal edit to a mirror row + record what fields are owed to Notion.
 * Caller should follow with pushPending() best-effort, or rely on the cron retry.
 */
export async function applyMirrorEdit(params: {
  table: MirrorTable;
  id: string;
  changes: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  console.warn(
    "[notion-mirror-deprecated] applyMirrorEdit no-op — mirror layer is dropped at Phase 6 cutoff 2026-06-02. Would have updated:",
    { table: params.table, id: params.id, changes: params.changes },
  );

  // notion-cutoff-2026-06-02: removed; mirror is dropped at Phase 6
  // const sb = getSupabaseServerClient();
  // const allowed = FIELD_MAP[params.table];
  //
  // const filtered: Record<string, unknown> = {};
  // for (const [k, v] of Object.entries(params.changes)) {
  //   if (k in allowed) filtered[k] = v;
  //   else return { ok: false, error: `Unknown field for ${params.table}: ${k}` };
  // }
  //
  // const { data: existing } = await sb
  //   .from(params.table)
  //   .select("pending_notion_push")
  //   .eq("id", params.id)
  //   .maybeSingle();
  //
  // // Merge with prior unpushed pending so we don't lose an earlier edit.
  // const mergedPending = {
  //   ...(existing?.pending_notion_push as Record<string, unknown> | null ?? {}),
  //   ...filtered,
  // };
  //
  // const { error } = await sb
  //   .from(params.table)
  //   .update({
  //     ...filtered,
  //     pending_notion_push: mergedPending,
  //     pending_set_at:      new Date().toISOString(),
  //     last_push_error:     null,
  //   })
  //   .eq("id", params.id);
  //
  // if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Push a single row's pending payload to Notion. On success, clears pending
 * + stamps last_push_at. On failure, leaves pending intact + stores error.
 */
export async function pushPending(table: MirrorTable, id: string): Promise<{ ok: boolean; error?: string }> {
  console.warn(
    "[notion-mirror-deprecated] pushPending no-op — Notion writes are decommissioned at Phase 6 cutoff 2026-06-02. Would have pushed:",
    { table, id },
  );

  // notion-cutoff-2026-06-02: removed; mirror is dropped at Phase 6
  // const sb = getSupabaseServerClient();
  // const { data, error } = await sb
  //   .from(table)
  //   .select("pending_notion_push")
  //   .eq("id", id)
  //   .maybeSingle();
  //
  // if (error) return { ok: false, error: error.message };
  // const pending = (data?.pending_notion_push as Record<string, unknown> | null) ?? null;
  // if (!pending || Object.keys(pending).length === 0) return { ok: true };
  //
  // const allowed = FIELD_MAP[table];
  // const properties: Record<string, any> = {};
  // for (const [col, val] of Object.entries(pending)) {
  //   const def = allowed[col];
  //   if (!def) continue;
  //   properties[def.notionName] = buildNotionProperty(def, val);
  // }
  //
  // try {
  //   await notion.pages.update({ page_id: id, properties });
  //   await sb.from(table).update({
  //     pending_notion_push: null,
  //     pending_set_at:      null,
  //     last_push_at:        new Date().toISOString(),
  //     last_push_error:     null,
  //   }).eq("id", id);
  //   return { ok: true };
  // } catch (e) {
  //   const msg = e instanceof Error ? e.message : String(e);
  //   await sb.from(table).update({
  //     last_push_error: msg.slice(0, 1000),
  //     last_push_at:    new Date().toISOString(),
  //   }).eq("id", id);
  //   return { ok: false, error: msg };
  // }
  return { ok: true };
}

/**
 * Drain all pending pushes across mirror tables. Conservative: 50 per table
 * per run so a Notion outage can't blow the function timeout.
 */
export async function pushAllPending(): Promise<{ table: string; pushed: number; failed: number }[]> {
  console.warn(
    "[notion-mirror-deprecated] pushAllPending no-op — drain is retired ahead of Phase 6 cutoff 2026-06-02.",
  );

  // notion-cutoff-2026-06-02: removed; mirror is dropped at Phase 6
  // const sb = getSupabaseServerClient();
  // const tables: MirrorTable[] = [
  //   "notion_decision_items",
  //   "notion_daily_briefings",
  //   "notion_insight_briefs",
  //   "notion_competitive_intel",
  // ];
  // const summary: { table: string; pushed: number; failed: number }[] = [];
  //
  // for (const t of tables) {
  //   const { data } = await sb
  //     .from(t)
  //     .select("id")
  //     .not("pending_notion_push", "is", null)
  //     .order("pending_set_at", { ascending: true })
  //     .limit(50);
  //   let pushed = 0, failed = 0;
  //   for (const row of (data ?? []) as { id: string }[]) {
  //     const r = await pushPending(t, row.id);
  //     if (r.ok) pushed++; else failed++;
  //   }
  //   summary.push({ table: t, pushed, failed });
  // }
  // return summary;

  // Return the same shape callers expect, with zero rows pushed/failed per table.
  return [
    { table: "notion_decision_items",   pushed: 0, failed: 0 },
    { table: "notion_daily_briefings",  pushed: 0, failed: 0 },
    { table: "notion_insight_briefs",   pushed: 0, failed: 0 },
    { table: "notion_competitive_intel", pushed: 0, failed: 0 },
  ];
}
