/**
 * POST /api/sync-evidence  [Wave 4 live sync — paired with sync-sources]
 *
 * Reads ALL evidence from CH Evidence [OS v2] and upserts into the canonical
 * Supabase `evidence` table.
 *
 * Design decisions:
 *   - Bridge key: notion_id (stable Notion page ID)
 *   - Idempotent: safe to run repeatedly; ON CONFLICT updates all Notion-sourced fields
 *   - Multi-selects (topics, affected_theme, geography) stored as JSON arrays (text column)
 *   - Relations: only first relation ID stored (project_notion_id, org_notion_id, source_notion_id)
 *   - Fetches ALL evidence (no status filter) — complete mirror
 *   - source_notion_id bridges to the `sources` table (run sync-sources first or same run)
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-agent-key header.
 * Cron: 0 11 * * 1-5 (11am weekdays, after sync-projects at 10am)
 *
 * Source DB: CH Evidence [OS v2] — fa28124978d043039d8932ac9964ccf5
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const DB_EVIDENCE = "fa28124978d043039d8932ac9964ccf5";

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
function dateStart(p: NotionPage): string | null {
  return p?.date?.start ?? null;
}
function multiSel(p: NotionPage): string[] {
  return p?.multi_select?.map((o: NotionPage) => o.name) ?? [];
}
function firstRelation(p: NotionPage): string | null {
  return p?.relation?.[0]?.id ?? null;
}

// ─── Row transform ────────────────────────────────────────────────────────────

function transform(page: NotionPage): Record<string, unknown> {
  const topics        = multiSel(prop(page, "Topics / Themes"));
  const affectedTheme = multiSel(prop(page, "Affected Theme"));
  const geography     = multiSel(prop(page, "Geography"));

  return {
    notion_id:          page.id,
    title:              titleText(prop(page, "Evidence Title")) ?? "Untitled",
    evidence_type:      sel(prop(page, "Evidence Type")),
    validation_status:  sel(prop(page, "Validation Status")),
    confidence_level:   sel(prop(page, "Confidence Level")),
    reusability_level:  sel(prop(page, "Reusability Level")),
    sensitivity_level:  sel(prop(page, "Sensitivity Level")),
    evidence_statement: titleText(prop(page, "Evidence Statement")),
    source_excerpt:     titleText(prop(page, "Source Excerpt")),
    topics:             topics.length        ? JSON.stringify(topics)        : null,
    affected_theme:     affectedTheme.length ? JSON.stringify(affectedTheme) : null,
    geography:          geography.length     ? JSON.stringify(geography)     : null,
    project_notion_id:  firstRelation(prop(page, "Project")),
    org_notion_id:      firstRelation(prop(page, "Organization")),
    source_notion_id:   firstRelation(prop(page, "Source Record")),
    date_captured:      dateStart(prop(page, "Date Captured")),
    reviewed_at:        dateStart(prop(page, "Reviewed At")),
    notion_created_at:  page.created_time ?? null,
    created_at:         page.created_time ?? new Date().toISOString(),
    updated_at:         page.last_edited_time ?? new Date().toISOString(),
  };
}

// ─── Notion pagination ────────────────────────────────────────────────────────

async function fetchAllEvidence(notion: Client): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: DB_EVIDENCE,
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
    const pages = await fetchAllEvidence(notion);
    stats.fetched = pages.length;

    if (pages.length === 0) {
      return NextResponse.json({ ok: true, ...stats, total_in_supabase: 0 });
    }

    const rows = pages.map(transform);

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await sb
        .from("evidence")
        .upsert(batch, { onConflict: "notion_id", ignoreDuplicates: false });

      if (error) {
        stats.errors.push(`batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      } else {
        stats.upserted += batch.length;
      }
    }

    const { count } = await sb
      .from("evidence")
      .select("*", { count: "exact", head: true });

    const { count: validatedCount } = await sb
      .from("evidence")
      .select("*", { count: "exact", head: true })
      .eq("validation_status", "Validated");

    const { count: blockerCount } = await sb
      .from("evidence")
      .select("*", { count: "exact", head: true })
      .eq("evidence_type", "Blocker");

    const { count: reusableCount } = await sb
      .from("evidence")
      .select("*", { count: "exact", head: true })
      .in("reusability_level", ["Reusable", "Canonical"]);

    return NextResponse.json({
      ok:                  stats.errors.length === 0,
      fetched_from_notion: stats.fetched,
      upserted:            stats.upserted,
      total_in_supabase:   count ?? 0,
      validated:           validatedCount ?? 0,
      blockers:            blockerCount ?? 0,
      reusable_canonical:  reusableCount ?? 0,
      errors:              stats.errors,
    });

  } catch (err) {
    console.error("[sync-evidence] Fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
