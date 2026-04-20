/**
 * POST /api/sync-organizations  [Wave 5 live sync — paired with sync-people]
 *
 * Reads ALL organizations from CH Organizations [OS v2] and upserts into the
 * canonical Supabase `organizations` table.
 *
 * Design decisions:
 *   - Bridge key: notion_id (stable Notion page ID)
 *   - Idempotent: safe to run repeatedly; ON CONFLICT updates all Notion-sourced fields
 *   - Multi-selects (org_domains, themes, startup_sector) stored as JSON arrays (text column)
 *   - Startup-specific fields (startup_stage, startup_mrr, etc.) only populated for Startups
 *   - Relations (Primary Contacts, Projects, Internal Owner) intentionally skipped —
 *     bridge is preserved via notion_id; joins happen at query time
 *   - Fetches ALL organizations (no filter) — complete master table mirror
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-agent-key header.
 * Cron: 0 12 * * 1-5 (noon weekdays, after evidence+sources at 11am)
 *
 * Source DB: CH Organizations [OS v2] — bef1bb86ab2b4cd280b6b33f9034b96c
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const DB_ORGANIZATIONS = "bef1bb86ab2b4cd280b6b33f9034b96c";

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
function multiSel(p: NotionPage): string[] {
  return p?.multi_select?.map((o: NotionPage) => o.name) ?? [];
}
function numProp(p: NotionPage): number | null {
  return typeof p?.number === "number" ? p.number : null;
}
function urlProp(p: NotionPage): string | null {
  return p?.url ?? null;
}

// ─── Row transform ────────────────────────────────────────────────────────────

function transform(page: NotionPage): Record<string, unknown> {
  const orgDomains    = multiSel(prop(page, "Organization Domains"));
  const themes        = multiSel(prop(page, "Themes / Topics"));
  const startupSector = multiSel(prop(page, "Startup Sector"));

  return {
    notion_id:                page.id,
    name:                     titleText(prop(page, "Name")) ?? "Untitled",
    org_category:             sel(prop(page, "Organization Category")),
    org_domains:              orgDomains.length    ? JSON.stringify(orgDomains)    : null,
    themes:                   themes.length        ? JSON.stringify(themes)        : null,
    relationship_stage:       sel(prop(page, "Relationship Stage")),
    country:                  sel(prop(page, "Country")),
    city:                     titleText(prop(page, "City / HQ City")),
    website:                  urlProp(prop(page, "Website")),
    notes:                    titleText(prop(page, "Notes")),
    special_handling_notes:   titleText(prop(page, "Special Handling Notes")),
    startup_stage:            sel(prop(page, "Startup Stage")),
    startup_sector:           startupSector.length ? JSON.stringify(startupSector) : null,
    startup_investment_status:sel(prop(page, "Startup Investment Status")),
    startup_funding_round:    titleText(prop(page, "Startup Funding Round")),
    startup_mrr:              numProp(prop(page, "Startup MRR")),
    startup_team_size:        numProp(prop(page, "Startup Team Size")),
    notion_created_at:        page.created_time ?? null,
    created_at:               page.created_time ?? new Date().toISOString(),
    updated_at:               page.last_edited_time ?? new Date().toISOString(),
  };
}

// ─── Notion pagination ────────────────────────────────────────────────────────

async function fetchAllOrganizations(notion: Client): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: DB_ORGANIZATIONS,
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
    const pages = await fetchAllOrganizations(notion);
    stats.fetched = pages.length;

    if (pages.length === 0) {
      return NextResponse.json({ ok: true, ...stats, total_in_supabase: 0 });
    }

    const rows = pages.map(transform);

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await sb
        .from("organizations")
        .upsert(batch, { onConflict: "notion_id", ignoreDuplicates: false });

      if (error) {
        stats.errors.push(`batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      } else {
        stats.upserted += batch.length;
      }
    }

    const { count } = await sb
      .from("organizations")
      .select("*", { count: "exact", head: true });

    const { count: startupCount } = await sb
      .from("organizations")
      .select("*", { count: "exact", head: true })
      .eq("org_category", "Startup");

    const { count: activeClientCount } = await sb
      .from("organizations")
      .select("*", { count: "exact", head: true })
      .eq("relationship_stage", "Active Client");

    return NextResponse.json({
      ok:                  stats.errors.length === 0,
      fetched_from_notion: stats.fetched,
      upserted:            stats.upserted,
      total_in_supabase:   count ?? 0,
      startups:            startupCount ?? 0,
      active_clients:      activeClientCount ?? 0,
      errors:              stats.errors,
    });

  } catch (err) {
    console.error("[sync-organizations] Fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
