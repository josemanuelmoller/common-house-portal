/**
 * Notion → Supabase read-mirror sync.
 *
 * Phase 1 of the Notion-to-Supabase migration. This module pulls fresh data
 * from a small set of hot Notion DBs and upserts it into local mirror tables
 * (notion_decision_items, notion_daily_briefings, notion_insight_briefs,
 * notion_watchlist, notion_competitive_intel). Notion remains the system of
 * record; the mirror is what the Hall reads on every page load.
 *
 * Each `sync*` function is independent so /api/cron/sync-notion-mirror can
 * call them in parallel and partial failures are isolated.
 */

import { notion, DB, prop, text, select, checkbox, date } from "@/lib/notion/core";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type SyncResult = {
  table: string;
  rows_seen: number;
  rows_upserted: number;
  duration_ms: number;
  error?: string;
};

async function logRun(r: SyncResult) {
  try {
    const sb = getSupabaseServerClient();
    await sb.from("notion_sync_runs").insert({
      table_name:    r.table,
      rows_seen:     r.rows_seen,
      rows_upserted: r.rows_upserted,
      duration_ms:   r.duration_ms,
      error:         r.error ?? null,
    });
  } catch {
    // log failure should never break the sync
  }
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export async function syncDecisions(): Promise<SyncResult> {
  const t0 = Date.now();
  const out: SyncResult = { table: "notion_decision_items", rows_seen: 0, rows_upserted: 0, duration_ms: 0 };
  try {
    const sb = getSupabaseServerClient();
    let cursor: string | undefined = undefined;
    const batch: Record<string, unknown>[] = [];

    do {
      const res = await notion.databases.query({
        database_id: DB.decisions,
        page_size:   100,
        start_cursor: cursor,
      });
      out.rows_seen += res.results.length;
      for (const page of res.results as { id: string; url?: string; last_edited_time?: string; properties: Record<string, unknown> }[]) {
        const titleProp = Object.values(page.properties).find((p): p is { type: string; title?: { plain_text: string }[] } =>
          (p as { type?: string })?.type === "title");
        const title = titleProp?.title?.[0]?.plain_text
          ?? text(prop(page, "Decision Title"))
          ?? text(prop(page, "Name"))
          ?? "Untitled";
        batch.push({
          id:                page.id,
          title,
          decision_type:     select(prop(page, "Decision Type")) || null,
          priority:          select(prop(page, "Priority")) || null,
          status:            select(prop(page, "Status")) || null,
          source_agent:      select(prop(page, "Source Agent")) || null,
          requires_execute:  checkbox(prop(page, "Requires Execute")),
          execute_approved:  checkbox(prop(page, "Execute Approved")),
          due_date:          date(prop(page, "Decision Due Date")),
          notes_raw:         text(prop(page, "Proposed Action")) || null,
          notion_url:        page.url ?? null,
          category:          select(prop(page, "Decision Category")) || null,
          last_edited_at:    page.last_edited_time ?? null,
          synced_at:         new Date().toISOString(),
        });
      }
      cursor = (res as { next_cursor?: string }).next_cursor ?? undefined;
    } while (cursor);

    if (batch.length > 0) {
      const { error } = await sb.from("notion_decision_items").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(error.message);
      out.rows_upserted = batch.length;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  out.duration_ms = Date.now() - t0;
  await logRun(out);
  return out;
}

// ─── Daily Briefings ──────────────────────────────────────────────────────────

export async function syncDailyBriefings(): Promise<SyncResult> {
  const t0 = Date.now();
  const out: SyncResult = { table: "notion_daily_briefings", rows_seen: 0, rows_upserted: 0, duration_ms: 0 };
  try {
    const sb = getSupabaseServerClient();
    // Only sync the last ~30 days — older briefings are immutable noise.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const res = await notion.databases.query({
      database_id: DB.dailyBriefings,
      filter: { property: "Date", date: { on_or_after: since } },
      sorts: [{ property: "Date", direction: "descending" }],
      page_size: 100,
    });
    out.rows_seen = res.results.length;
    const batch: Record<string, unknown>[] = [];
    for (const page of res.results as { id: string; last_edited_time?: string; properties: Record<string, unknown> }[]) {
      batch.push({
        id:                 page.id,
        brief_date:         date(prop(page, "Date")),
        focus_of_day:       text(prop(page, "Focus of the Day")) || null,
        meeting_prep:       text(prop(page, "Meeting Prep")) || null,
        my_commitments:     text(prop(page, "My Commitments")) || null,
        follow_up_queue:    text(prop(page, "Follow-up Queue")) || null,
        agent_queue:        text(prop(page, "Agent Queue")) || null,
        market_signals:     text(prop(page, "Market Signals")) || null,
        ready_to_publish:   text(prop(page, "Ready to Publish")) || null,
        generated_at:       date(prop(page, "Generated At")),
        status:             select(prop(page, "Status")) || null,
        last_edited_at:     page.last_edited_time ?? null,
        synced_at:          new Date().toISOString(),
      });
    }
    if (batch.length > 0) {
      const { error } = await sb.from("notion_daily_briefings").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(error.message);
      out.rows_upserted = batch.length;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  out.duration_ms = Date.now() - t0;
  await logRun(out);
  return out;
}

// ─── Insight Briefs ───────────────────────────────────────────────────────────

export async function syncInsightBriefs(): Promise<SyncResult> {
  const t0 = Date.now();
  const out: SyncResult = { table: "notion_insight_briefs", rows_seen: 0, rows_upserted: 0, duration_ms: 0 };
  try {
    const sb = getSupabaseServerClient();
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const res = await notion.databases.query({
      database_id: DB.insightBriefs,
      filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 100,
    });
    out.rows_seen = res.results.length;
    const batch: Record<string, unknown>[] = [];
    for (const page of res.results as { id: string; url?: string; last_edited_time?: string; properties: Record<string, unknown> }[]) {
      const url = (page.properties?.["Source Link"] as { url?: string } | undefined)?.url ?? null;
      batch.push({
        id:              page.id,
        title:           text(prop(page, "Title")) || "Untitled",
        source_link:     url,
        notion_url:      page.url ?? null,
        theme:           select(prop(page, "Theme")) || null,
        source_type:     select(prop(page, "Source Type")) || null,
        last_edited_at:  page.last_edited_time ?? null,
        synced_at:       new Date().toISOString(),
      });
    }
    if (batch.length > 0) {
      const { error } = await sb.from("notion_insight_briefs").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(error.message);
      out.rows_upserted = batch.length;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  out.duration_ms = Date.now() - t0;
  await logRun(out);
  return out;
}

// ─── Watchlist (referenced by competitive_intel) ──────────────────────────────

export async function syncWatchlist(): Promise<SyncResult> {
  const t0 = Date.now();
  const out: SyncResult = { table: "notion_watchlist", rows_seen: 0, rows_upserted: 0, duration_ms: 0 };
  try {
    const sb = getSupabaseServerClient();
    const res = await notion.databases.query({
      database_id: DB.watchlist,
      page_size: 100,
    });
    out.rows_seen = res.results.length;
    const batch: Record<string, unknown>[] = [];
    for (const page of res.results as { id: string; last_edited_time?: string; properties: Record<string, unknown> }[]) {
      batch.push({
        id:              page.id,
        name:            text(prop(page, "Name")) || "Unknown",
        type:            select(prop(page, "Type")) || null,
        website:         (page.properties?.["Website"] as { url?: string } | undefined)?.url ?? null,
        scan_frequency:  select(prop(page, "Scan Frequency")) || null,
        active:          checkbox(prop(page, "Active")),
        last_edited_at:  page.last_edited_time ?? null,
        synced_at:       new Date().toISOString(),
      });
    }
    if (batch.length > 0) {
      const { error } = await sb.from("notion_watchlist").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(error.message);
      out.rows_upserted = batch.length;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  out.duration_ms = Date.now() - t0;
  await logRun(out);
  return out;
}

// ─── Competitive Intel ────────────────────────────────────────────────────────

export async function syncCompetitiveIntel(): Promise<SyncResult> {
  const t0 = Date.now();
  const out: SyncResult = { table: "notion_competitive_intel", rows_seen: 0, rows_upserted: 0, duration_ms: 0 };
  try {
    const sb = getSupabaseServerClient();
    const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

    // Fetch watchlist map first so we can denormalize entity_name + entity_type.
    const wl = await sb
      .from("notion_watchlist")
      .select("id, name, type")
      .returns<{ id: string; name: string; type: string | null }[]>();
    const wlMap = new Map<string, { name: string; type: string | null }>();
    for (const row of wl.data ?? []) wlMap.set(row.id, { name: row.name, type: row.type });

    let cursor: string | undefined = undefined;
    const batch: Record<string, unknown>[] = [];
    do {
      const res = await notion.databases.query({
        database_id: DB.competitiveIntel,
        filter: { property: "Date Captured", date: { on_or_after: since } },
        sorts: [{ property: "Date Captured", direction: "descending" }],
        page_size: 100,
        start_cursor: cursor,
      });
      out.rows_seen += res.results.length;
      for (const page of res.results as { id: string; url?: string; created_time?: string; last_edited_time?: string; properties: Record<string, unknown> }[]) {
        const rel = (page.properties?.["Watchlist Entry"] as { relation?: { id: string }[] } | undefined)?.relation ?? [];
        const entityId = rel[0]?.id ?? null;
        const entity   = entityId ? wlMap.get(entityId) ?? null : null;
        const sourceUrl = (page.properties?.["Source URL"] as { url?: string } | undefined)?.url ?? null;
        batch.push({
          id:              page.id,
          notion_url:      page.url ?? null,
          title:           text(prop(page, "Title")) || "Untitled signal",
          summary:         text(prop(page, "Summary")) || null,
          signal_type:     select(prop(page, "Signal Type")) || null,
          relevance:       select(prop(page, "Relevance")) || null,
          status:          select(prop(page, "Status")) || null,
          source_url:      typeof sourceUrl === "string" && sourceUrl.length > 0 ? sourceUrl : null,
          date_captured:   date(prop(page, "Date Captured")) ?? page.created_time?.slice(0, 10) ?? null,
          entity_id:       entityId,
          entity_name:     entity?.name ?? null,
          entity_type:     entity?.type ?? null,
          last_edited_at:  page.last_edited_time ?? null,
          synced_at:       new Date().toISOString(),
        });
      }
      cursor = (res as { next_cursor?: string }).next_cursor ?? undefined;
    } while (cursor);

    if (batch.length > 0) {
      const { error } = await sb.from("notion_competitive_intel").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(error.message);
      out.rows_upserted = batch.length;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  out.duration_ms = Date.now() - t0;
  await logRun(out);
  return out;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function syncAllNotionMirrors(): Promise<SyncResult[]> {
  // Watchlist must finish before competitive_intel so the join map is populated.
  const wl = await syncWatchlist();
  const rest = await Promise.all([
    syncDecisions(),
    syncDailyBriefings(),
    syncInsightBriefs(),
    syncCompetitiveIntel(),
  ]);
  return [wl, ...rest];
}
