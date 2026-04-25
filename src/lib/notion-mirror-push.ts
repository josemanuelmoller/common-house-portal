/**
 * Phase 2 — reverse sync: push portal edits from Supabase mirrors back to Notion.
 *
 * Edit flow (portal → Supabase → Notion):
 *   1. UI POSTs to a portal-edit API.
 *   2. Handler calls applyMirrorEdit(): updates the mirror row + stores the
 *      same change as `pending_notion_push` (so the row is "owed" to Notion).
 *   3. Handler calls pushPending() best-effort. On success → pending cleared.
 *      On failure → row keeps its pending payload + last_push_error set.
 *   4. Forward sync (Notion → Supabase) skips rows with pending_notion_push
 *      set, so it never clobbers an unpushed local change.
 *   5. /api/cron/push-pending-to-notion runs periodically, retries failures.
 */

import { notion } from "@/lib/notion/core";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type MirrorTable =
  | "notion_decision_items"
  | "notion_daily_briefings"
  | "notion_insight_briefs"
  | "notion_competitive_intel";

type FieldDef =
  | { kind: "select"; notionName: string }
  | { kind: "rich_text"; notionName: string }
  | { kind: "checkbox"; notionName: string }
  | { kind: "date"; notionName: string };

// Per-table allowed columns + how to render them as Notion properties.
// Add columns here as we onboard more edit flows. Keys = Supabase column.
const FIELD_MAP: Record<MirrorTable, Record<string, FieldDef>> = {
  notion_decision_items: {
    status:           { kind: "select",    notionName: "Status" },
    resolution_note:  { kind: "rich_text", notionName: "Resolution Note" },
  },
  notion_daily_briefings: {
    status:           { kind: "select",    notionName: "Status" },
  },
  notion_insight_briefs: {},
  notion_competitive_intel: {
    status:           { kind: "select",    notionName: "Status" },
    relevance:        { kind: "select",    notionName: "Relevance" },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNotionProperty(def: FieldDef, value: unknown): any {
  if (value === null || value === undefined) {
    if (def.kind === "select")    return { select: null };
    if (def.kind === "rich_text") return { rich_text: [] };
    if (def.kind === "checkbox")  return { checkbox: false };
    if (def.kind === "date")      return { date: null };
  }
  if (def.kind === "select")    return { select: { name: String(value) } };
  if (def.kind === "rich_text") return { rich_text: [{ text: { content: String(value).slice(0, 2000) } }] };
  if (def.kind === "checkbox")  return { checkbox: Boolean(value) };
  if (def.kind === "date")      return { date: { start: String(value) } };
  return null;
}

/**
 * Apply a portal edit to a mirror row + record what fields are owed to Notion.
 * Caller should follow with pushPending() best-effort, or rely on the cron retry.
 */
export async function applyMirrorEdit(params: {
  table: MirrorTable;
  id: string;
  changes: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseServerClient();
  const allowed = FIELD_MAP[params.table];

  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params.changes)) {
    if (k in allowed) filtered[k] = v;
    else return { ok: false, error: `Unknown field for ${params.table}: ${k}` };
  }

  const { data: existing } = await sb
    .from(params.table)
    .select("pending_notion_push")
    .eq("id", params.id)
    .maybeSingle();

  // Merge with prior unpushed pending so we don't lose an earlier edit.
  const mergedPending = {
    ...(existing?.pending_notion_push as Record<string, unknown> | null ?? {}),
    ...filtered,
  };

  const { error } = await sb
    .from(params.table)
    .update({
      ...filtered,
      pending_notion_push: mergedPending,
      pending_set_at:      new Date().toISOString(),
      last_push_error:     null,
    })
    .eq("id", params.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Push a single row's pending payload to Notion. On success, clears pending
 * + stamps last_push_at. On failure, leaves pending intact + stores error.
 */
export async function pushPending(table: MirrorTable, id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from(table)
    .select("pending_notion_push")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  const pending = (data?.pending_notion_push as Record<string, unknown> | null) ?? null;
  if (!pending || Object.keys(pending).length === 0) return { ok: true };

  const allowed = FIELD_MAP[table];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};
  for (const [col, val] of Object.entries(pending)) {
    const def = allowed[col];
    if (!def) continue;
    properties[def.notionName] = buildNotionProperty(def, val);
  }

  try {
    await notion.pages.update({ page_id: id, properties });
    await sb.from(table).update({
      pending_notion_push: null,
      pending_set_at:      null,
      last_push_at:        new Date().toISOString(),
      last_push_error:     null,
    }).eq("id", id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from(table).update({
      last_push_error: msg.slice(0, 1000),
      last_push_at:    new Date().toISOString(),
    }).eq("id", id);
    return { ok: false, error: msg };
  }
}

/**
 * Drain all pending pushes across mirror tables. Conservative: 50 per table
 * per run so a Notion outage can't blow the function timeout.
 */
export async function pushAllPending(): Promise<{ table: string; pushed: number; failed: number }[]> {
  const sb = getSupabaseServerClient();
  const tables: MirrorTable[] = [
    "notion_decision_items",
    "notion_daily_briefings",
    "notion_insight_briefs",
    "notion_competitive_intel",
  ];
  const summary: { table: string; pushed: number; failed: number }[] = [];

  for (const t of tables) {
    const { data } = await sb
      .from(t)
      .select("id")
      .not("pending_notion_push", "is", null)
      .order("pending_set_at", { ascending: true })
      .limit(50);
    let pushed = 0, failed = 0;
    for (const row of (data ?? []) as { id: string }[]) {
      const r = await pushPending(t, row.id);
      if (r.ok) pushed++; else failed++;
    }
    summary.push({ table: t, pushed, failed });
  }
  return summary;
}
