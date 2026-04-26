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
  | "notion_competitive_intel"
  | "notion_agent_drafts";

type FieldDef =
  | { kind: "select"; notionName: string }
  | { kind: "rich_text"; notionName: string }
  | { kind: "title"; notionName: string }
  | { kind: "checkbox"; notionName: string }
  | { kind: "date"; notionName: string }
  | { kind: "url"; notionName: string }
  | { kind: "number"; notionName: string }
  | { kind: "multi_select"; notionName: string };

// Per-table allowed columns + how to render them as Notion properties.
// Add columns here as we onboard more edit/create flows. Keys = Supabase column.
const FIELD_MAP: Record<MirrorTable, Record<string, FieldDef>> = {
  notion_decision_items: {
    title:            { kind: "title",     notionName: "Decision Title" },
    status:           { kind: "select",    notionName: "Status" },
    resolution_note:  { kind: "rich_text", notionName: "Resolution Note" },
    decision_type:    { kind: "select",    notionName: "Decision Type" },
    priority:         { kind: "select",    notionName: "Priority" },
    source_agent:     { kind: "select",    notionName: "Source Agent" },
    requires_execute: { kind: "checkbox",  notionName: "Requires Execute" },
    execute_approved: { kind: "checkbox",  notionName: "Execute Approved" },
    due_date:         { kind: "date",      notionName: "Decision Due Date" },
    notes_raw:        { kind: "rich_text", notionName: "Proposed Action" },
    category:         { kind: "select",    notionName: "Decision Category" },
  },
  notion_daily_briefings: {
    status:           { kind: "select",    notionName: "Status" },
    brief_date:       { kind: "date",      notionName: "Date" },
    focus_of_day:     { kind: "rich_text", notionName: "Focus of the Day" },
    meeting_prep:     { kind: "rich_text", notionName: "Meeting Prep" },
    my_commitments:   { kind: "rich_text", notionName: "My Commitments" },
    follow_up_queue:  { kind: "rich_text", notionName: "Follow-up Queue" },
    agent_queue:      { kind: "rich_text", notionName: "Agent Queue" },
    market_signals:   { kind: "rich_text", notionName: "Market Signals" },
    ready_to_publish: { kind: "rich_text", notionName: "Ready to Publish" },
    generated_at:     { kind: "date",      notionName: "Generated At" },
  },
  notion_insight_briefs: {
    title:            { kind: "title",     notionName: "Title" },
    source_link:      { kind: "url",       notionName: "Source Link" },
    theme:            { kind: "select",    notionName: "Theme" },
    source_type:      { kind: "select",    notionName: "Source Type" },
  },
  notion_competitive_intel: {
    title:            { kind: "title",     notionName: "Title" },
    summary:          { kind: "rich_text", notionName: "Summary" },
    signal_type:      { kind: "select",    notionName: "Signal Type" },
    relevance:        { kind: "select",    notionName: "Relevance" },
    status:           { kind: "select",    notionName: "Status" },
    source_url:       { kind: "url",       notionName: "Source URL" },
    date_captured:    { kind: "date",      notionName: "Date Captured" },
  },
  notion_agent_drafts: {
    title:            { kind: "title",     notionName: "Draft Title" },
    status:           { kind: "select",    notionName: "Status" },
    draft_text:       { kind: "rich_text", notionName: "Content" },
    draft_type:       { kind: "select",    notionName: "Type" },
    voice:            { kind: "select",    notionName: "Voice" },
    platform:         { kind: "select",    notionName: "Platform" },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNotionProperty(def: FieldDef, value: unknown): any {
  if (value === null || value === undefined) {
    if (def.kind === "select")       return { select: null };
    if (def.kind === "rich_text")    return { rich_text: [] };
    if (def.kind === "title")        return { title: [] };
    if (def.kind === "checkbox")     return { checkbox: false };
    if (def.kind === "date")         return { date: null };
    if (def.kind === "url")          return { url: null };
    if (def.kind === "number")       return { number: null };
    if (def.kind === "multi_select") return { multi_select: [] };
  }
  if (def.kind === "select")    return { select: { name: String(value) } };
  if (def.kind === "rich_text") return { rich_text: [{ text: { content: String(value).slice(0, 2000) } }] };
  if (def.kind === "title")     return { title: [{ text: { content: String(value).slice(0, 2000) } }] };
  if (def.kind === "checkbox")  return { checkbox: Boolean(value) };
  if (def.kind === "date")      return { date: { start: String(value) } };
  if (def.kind === "url")       return { url: String(value) };
  if (def.kind === "number")    return { number: Number(value) };
  if (def.kind === "multi_select") {
    const arr = Array.isArray(value) ? value : [value];
    return { multi_select: arr.map(v => ({ name: String(v) })) };
  }
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

// ─── Phase 3 — CREATE pattern for agents / skills ────────────────────────────
// Notion is still the canonical source of truth, so creates go Notion-first:
//   1. Create the page in Notion (gets the canonical page id back).
//   2. Insert the same data into the Supabase mirror with that id.
// Agents call this helper instead of the Notion SDK directly. The Hall reads
// the mirror, so the new row is visible on next page render with no extra
// sync wait.
//
// A future-state Supabase-first variant (mirror_uuid + nullable notion_id +
// reverse-create cron) is the architecturally cleaner model but requires a
// schema change on every mirror table. Tracked as future work.

type DatabaseId = string; // Notion database id

const TABLE_TO_DB: Record<MirrorTable, DatabaseId> = {
  notion_decision_items:    "6b801204c4de49c7b6179e04761a285a",
  notion_daily_briefings:   "d206d6cdb09040d3ac2f34a977ad9f2a",
  notion_insight_briefs:    "04bed3a3fd1a4b3a99643cd21562e08a",
  notion_competitive_intel: "af8d7edb750b4131b3b55ef5ee83556a",
  notion_agent_drafts:      "9844ece875ea4c618f616e8cc97d5a90",
};

/**
 * Create a Notion page AND mirror it into Supabase in one call.
 *
 * `fields` is the same column-keyed shape as applyMirrorEdit's `changes` —
 * lets the same FIELD_MAP drive both edits and creates. Caller supplies
 * any extra Supabase columns via `mirrorOnly` (e.g. denormalized fields
 * that don't have a Notion property like entity_name).
 */
export async function createPageWithMirror(params: {
  table:      MirrorTable;
  fields:     Record<string, unknown>;        // mapped through FIELD_MAP → Notion properties + mirror columns
  mirrorOnly?: Record<string, unknown>;       // extra Supabase columns (no Notion equivalent)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraNotionProperties?: Record<string, any>; // Notion property payloads that don't map cleanly (relations, multi_select, etc.)
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const allowed = FIELD_MAP[params.table];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = { ...(params.extraNotionProperties ?? {}) };
  const mirrorRow: Record<string, unknown> = { ...(params.mirrorOnly ?? {}) };

  for (const [col, val] of Object.entries(params.fields)) {
    const def = allowed[col];
    if (!def) return { ok: false, error: `Unknown field for ${params.table}: ${col}` };
    properties[def.notionName] = buildNotionProperty(def, val);
    mirrorRow[col] = val;
  }

  // 1) Create in Notion — canonical id source.
  let pageId: string;
  let pageUrl: string | null = null;
  try {
    const created = await notion.pages.create({
      parent: { database_id: TABLE_TO_DB[params.table] },
      properties,
    });
    pageId = (created as { id: string }).id;
    pageUrl = (created as { url?: string }).url ?? null;
  } catch (e) {
    return { ok: false, error: `Notion create failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 2) Insert into mirror with the real id. last_edited_at left null until
  //    next forward sync stamps it from Notion.
  const sb = getSupabaseServerClient();
  mirrorRow.id          = pageId;
  mirrorRow.notion_url  = pageUrl;
  mirrorRow.synced_at   = new Date().toISOString();
  const { error } = await sb.from(params.table).insert(mirrorRow);
  if (error) {
    // Notion create already succeeded; surface the mirror failure but the
    // forward sync will eventually pick the row up. Don't fail the caller.
    return { ok: true, id: pageId, error: `Mirror insert warning: ${error.message}` };
  }
  return { ok: true, id: pageId };
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
