/**
 * POST /api/sync-sources  [Wave 4 live sync — paired with sync-evidence]
 *
 * Reads ALL sources from CH Sources [OS v2] and upserts into the canonical
 * Supabase `sources` table.
 *
 * Design decisions:
 *   - Bridge key: notion_id (stable Notion page ID)
 *   - Idempotent: safe to run repeatedly; ON CONFLICT updates all Notion-sourced fields
 *   - Relations: only first relation ID stored (project_notion_id, org_notion_id)
 *   - Fetches ALL sources (no status filter) — complete mirror
 *   - evidence_extracted, knowledge_relevant, attachments_present stored as booleans
 *   - processed_summary synced — key field for scan-opportunity-candidates and CoS context
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-agent-key header.
 * Cron: 0 11 * * 1-5 (11am weekdays, paired with sync-evidence)
 *
 * Source DB: CH Sources [OS v2] — d88aff1b019d4110bcefab7f5bfbd0ae
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const DB_SOURCES = "d88aff1b019d4110bcefab7f5bfbd0ae";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const agentKey = req.headers.get("x-agent-key");
  if (agentKey === secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

// ─── Notion property helpers ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionPage = any;

function prop(page: NotionPage, name: string) {
  return page.properties?.[name];
}
function titleText(p: NotionPage): string | null {
  if (!p) return null;
  if (p.type === "title")     return p.title?.map((t: NotionPage) => t.plain_text).join("") || null;
  if (p.type === "rich_text") return p.rich_text?.map((t: NotionPage) => t.plain_text).join("") || null;
  return null;
}
function sel(p: NotionPage): string | null {
  return p?.select?.name ?? null;
}
function bool(p: NotionPage): boolean {
  return p?.checkbox === true;
}
function dateStart(p: NotionPage): string | null {
  return p?.date?.start ?? null;
}
function firstRelation(p: NotionPage): string | null {
  return p?.relation?.[0]?.id ?? null;
}
function urlProp(p: NotionPage): string | null {
  return p?.url ?? null;
}

// ─── Row transform ────────────────────────────────────────────────────────────

function transform(page: NotionPage): Record<string, unknown> {
  return {
    notion_id:          page.id,
    title:              titleText(prop(page, "Source Title")) ?? "Untitled",
    source_type:        sel(prop(page, "Source Type")),
    source_platform:    sel(prop(page, "Source Platform")),
    processing_status:  sel(prop(page, "Processing Status")),
    relevance_status:   sel(prop(page, "Relevance Status")),
    sensitivity:        sel(prop(page, "Sensitivity")),
    access_level:       sel(prop(page, "Access Level")),
    processed_summary:  titleText(prop(page, "Processed Summary")),
    sanitized_notes:    titleText(prop(page, "Sanitized Notes")),
    attachment_notes:   titleText(prop(page, "Attachment Notes")),
    source_external_id: titleText(prop(page, "Source External ID")),
    dedup_key:          titleText(prop(page, "Dedup Key")),
    thread_id:          titleText(prop(page, "Thread ID / Doc ID")),
    evidence_extracted: bool(prop(page, "Evidence Extracted?")),
    knowledge_relevant: bool(prop(page, "Knowledge Relevant?")),
    attachments_present:bool(prop(page, "Attachments Present?")),
    source_url:         urlProp(prop(page, "Source URL")),
    project_notion_id:  firstRelation(prop(page, "Linked Projects")),
    org_notion_id:      firstRelation(prop(page, "Linked Organizations")),
    source_date:        dateStart(prop(page, "Source Date")),
    last_source_update: dateStart(prop(page, "Last Source Update")),
    notion_created_at:  page.created_time ?? null,
    created_at:         page.created_time ?? new Date().toISOString(),
    updated_at:         page.last_edited_time ?? new Date().toISOString(),
  };
}

// ─── Notion pagination ────────────────────────────────────────────────────────

async function fetchAllSources(notion: Client): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: DB_SOURCES,
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
    const pages = await fetchAllSources(notion);
    stats.fetched = pages.length;

    if (pages.length === 0) {
      return NextResponse.json({ ok: true, ...stats, total_in_supabase: 0 });
    }

    const rows = pages.map(transform);

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await sb
        .from("sources")
        .upsert(batch, { onConflict: "notion_id", ignoreDuplicates: false });

      if (error) {
        stats.errors.push(`batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      } else {
        stats.upserted += batch.length;
      }
    }

    const { count } = await sb
      .from("sources")
      .select("*", { count: "exact", head: true });

    const { count: processedCount } = await sb
      .from("sources")
      .select("*", { count: "exact", head: true })
      .eq("processing_status", "Processed");

    const { count: meetingCount } = await sb
      .from("sources")
      .select("*", { count: "exact", head: true })
      .eq("source_type", "Meeting");

    const { count: withSummaryCount } = await sb
      .from("sources")
      .select("*", { count: "exact", head: true })
      .not("processed_summary", "is", null);

    return NextResponse.json({
      ok:                  stats.errors.length === 0,
      fetched_from_notion: stats.fetched,
      upserted:            stats.upserted,
      total_in_supabase:   count ?? 0,
      processed:           processedCount ?? 0,
      meetings:            meetingCount ?? 0,
      with_summary:        withSummaryCount ?? 0,
      errors:              stats.errors,
    });

  } catch (err) {
    console.error("[sync-sources] Fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
