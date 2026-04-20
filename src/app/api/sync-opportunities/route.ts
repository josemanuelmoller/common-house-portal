/**
 * POST /api/sync-opportunities  [Wave 1 live sync]
 *
 * Reads ALL opportunities from Notion [OS v2] and upserts into the canonical
 * Supabase `opportunities` table.
 *
 * Design decisions:
 *   - Bridge key: notion_id (stable Notion page ID)
 *   - Idempotent: safe to run repeatedly; ON CONFLICT updates Notion-sourced fields only
 *   - Derived flags preserved: is_legacy, is_actionable, data_quality_score are NOT
 *     overwritten on existing records (they may be manually curated)
 *   - is_active / is_archived ARE recomputed from status on every run (deterministic)
 *   - org_name is NOT synced (requires a second Notion API call per record; omit for now)
 *   - Cron-safe: handles Notion pagination, batches upserts, returns stats
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-agent-key header.
 * Cron: runs after sync-loops (0 8 * * 1-5) — add to vercel.json when ready.
 *
 * Source DB: Opportunities [OS v2] — 687caa98594a41b595c9960c141be0c0
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const agentKey = req.headers.get("x-agent-key");
  if (agentKey === secret) return true;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  return false;
}

// ─── Notion property helpers ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionPage = any;

function prop(page: NotionPage, name: string) {
  return page.properties?.[name];
}

function text(p: NotionPage): string {
  if (!p) return "";
  if (p.type === "title")     return p.title?.map((t: NotionPage) => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map((t: NotionPage) => t.plain_text).join("") ?? "";
  return "";
}

function sel(p: NotionPage): string | null {
  if (!p) return null;
  return p.select?.name ?? null;
}

function urlProp(p: NotionPage): string | null {
  if (!p) return null;
  return p.url ?? null;
}

function numProp(p: NotionPage): number | null {
  if (!p) return null;
  const n = p.number;
  return n != null ? n : null;
}

function dateProp(p: NotionPage): string | null {
  if (!p) return null;
  return p.date?.start ?? null;
}

function relationFirst(p: NotionPage): string | null {
  if (!p) return null;
  return p.relation?.[0]?.id ?? null;
}

// ─── Row transform ────────────────────────────────────────────────────────────

const ACTIVE_STATUSES  = new Set(["Active", "Qualifying", "New"]);
const ARCHIVED_STATUSES = new Set(["Closed Won", "Closed Lost"]);

function transform(page: NotionPage): Record<string, unknown> {
  const status = sel(prop(page, "Opportunity Status")) ?? "New";

  // Title: try both field names (migration confirmed either may exist)
  const title =
    text(prop(page, "Opportunity Name")) ||
    text(prop(page, "Name")) ||
    "Untitled";

  const triggerSignal = text(prop(page, "Trigger / Signal")) || null;

  return {
    notion_id:            page.id,
    title,
    status,
    scope:                sel(prop(page, "Scope")),
    follow_up_status:     sel(prop(page, "Follow-up Status")),
    opportunity_type:     sel(prop(page, "Opportunity Type")),
    opportunity_score:    numProp(prop(page, "Opportunity Score")),
    qualification_status: sel(prop(page, "Qualification Status")) ?? "Not Scored",
    priority:             sel(prop(page, "Priority")),
    probability:          (sel(prop(page, "Probability")) ?? text(prop(page, "Probability"))) || null,
    org_notion_id:        relationFirst(prop(page, "Account / Organization")),
    // org_name intentionally omitted — requires second API call
    source_url:           urlProp(prop(page, "Source URL")),
    review_url:           page.url ?? null,
    trigger_signal:       triggerSignal,
    pending_action:       triggerSignal,  // same field, mapped to both columns
    suggested_next_step:  text(prop(page, "Suggested Next Step")) || null,
    notes:                text(prop(page, "Notes")) || null,
    why_there_is_fit:     text(prop(page, "Why There Is Fit")) || null,
    source_evidence:      text(prop(page, "Source Evidence")) || null,
    value_estimate:       (numProp(prop(page, "Value Estimate")) ?? numProp(prop(page, "Deal Value"))),
    expected_close_date:  dateProp(prop(page, "Expected Close Date")),
    next_meeting_at:      dateProp(prop(page, "Next Meeting Date")),
    notion_created_at:    page.created_time ?? null,
    // Notion-sourced timestamps
    created_at:           page.created_time ?? new Date().toISOString(),
    updated_at:           page.last_edited_time ?? new Date().toISOString(),
    // Computed deterministically from status — safe to overwrite every sync
    is_active:            ACTIVE_STATUSES.has(status),
    is_archived:          ARCHIVED_STATUSES.has(status),
  };
}

// ─── Notion pagination ────────────────────────────────────────────────────────

async function fetchAllOpportunities(notion: Client): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: DB_OPPORTUNITIES,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    all.push(...res.results);
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);

  return all;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const sb     = getSupabaseServerClient();

  const stats = { fetched: 0, upserted: 0, errors: [] as string[] };

  try {
    // ── 1. Fetch from Notion ─────────────────────────────────────────────────
    const pages = await fetchAllOpportunities(notion);
    stats.fetched = pages.length;

    if (pages.length === 0) {
      return NextResponse.json({ ok: true, ...stats, total_in_supabase: 0 });
    }

    // ── 2. Transform ─────────────────────────────────────────────────────────
    const rows = pages.map(transform);

    // ── 3. Batch upsert ──────────────────────────────────────────────────────
    // ON CONFLICT (notion_id): update Notion-sourced and computed-deterministic fields.
    // DO NOT update: is_legacy, is_actionable, data_quality_score (may be manually curated).
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await sb
        .from("opportunities")
        .upsert(batch, {
          onConflict: "notion_id",
          ignoreDuplicates: false,
        });

      if (error) {
        stats.errors.push(`batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      } else {
        stats.upserted += batch.length;
      }
    }

    // ── 4. Final count ───────────────────────────────────────────────────────
    const { count } = await sb
      .from("opportunities")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      ok:               stats.errors.length === 0,
      fetched_from_notion: stats.fetched,
      upserted:         stats.upserted,
      total_in_supabase: count ?? 0,
      errors:           stats.errors,
    });

  } catch (err) {
    console.error("[sync-opportunities] Fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
