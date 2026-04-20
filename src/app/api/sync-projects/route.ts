/**
 * POST /api/sync-projects  [Wave 3 live sync]
 *
 * Reads ALL projects from CH Projects [OS v2] and upserts into the canonical
 * Supabase `projects` table.
 *
 * Design decisions:
 *   - Bridge key: notion_id (stable Notion page ID)
 *   - Idempotent: safe to run repeatedly; ON CONFLICT updates all Notion-sourced fields
 *   - Hall editorial fields (hall_mode, hall_*) are synced — they are read from Notion
 *     and stored here for future Supabase-first Hall reads. Hall reads remain Notion-first
 *     for now (no blast radius). This sync keeps Supabase current.
 *   - Relation fields: only first relation ID stored (primary_org_notion_id,
 *     project_lead_notion_id). Full team/org relations are out of scope.
 *   - Multi-selects (themes, geography) stored as JSON arrays (text column).
 *   - Fetches ALL projects (not just Active) so the table is a complete mirror.
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-agent-key header.
 * Cron: 0 10 * * 1-5 (10am weekdays, after sync-opportunities at 9am)
 *
 * Source DB: CH Projects [OS v2] — 49d59b18095f46588960f2e717832c5f
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const DB_PROJECTS = "49d59b18095f46588960f2e717832c5f";

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
function text(p: NotionPage): string | null {
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
function multiSel(p: NotionPage): string[] {
  return p?.multi_select?.map((o: NotionPage) => o.name) ?? [];
}
function firstRelation(p: NotionPage): string | null {
  return p?.relation?.[0]?.id ?? null;
}

// ─── Row transform ────────────────────────────────────────────────────────────

function transform(page: NotionPage): Record<string, unknown> {
  const themes    = multiSel(prop(page, "Themes / Topics"));
  const geography = multiSel(prop(page, "Geography"));

  return {
    notion_id:               page.id,
    name:                    text(prop(page, "Project Name")) ?? "Untitled",
    project_status:          sel(prop(page, "Project Status")),
    current_stage:           sel(prop(page, "Current Stage")),
    project_type:            sel(prop(page, "Project Type")),
    engagement_model:        sel(prop(page, "Engagement Model")),
    engagement_stage:        sel(prop(page, "Engagement Stage")),
    primary_workspace:       sel(prop(page, "Primary Workspace")),
    update_needed:           bool(prop(page, "Project Update Needed?")),
    status_summary:          text(prop(page, "Status Summary")),
    draft_status_update:     text(prop(page, "Draft Status Update")),
    objective_outcome:       text(prop(page, "Objective / Outcome")),
    themes:                  themes.length    ? JSON.stringify(themes)    : null,
    geography:               geography.length ? JSON.stringify(geography) : null,
    grant_eligible:          bool(prop(page, "Grant Eligible")),
    primary_org_notion_id:   firstRelation(prop(page, "Primary Organization")),
    project_lead_notion_id:  firstRelation(prop(page, "Project Lead")),
    // Hall editorial
    hall_mode:               sel(prop(page, "Hall Mode")),
    hall_welcome_note:       text(prop(page, "Hall Welcome Note")),
    hall_current_focus:      text(prop(page, "Hall Current Focus")),
    hall_next_milestone:     text(prop(page, "Hall Next Milestone")),
    hall_challenge:          text(prop(page, "Hall Challenge")),
    hall_matters_most:       text(prop(page, "Hall Matters Most")),
    hall_obstacles:          text(prop(page, "Hall Obstacles")),
    hall_success:            text(prop(page, "Hall Success")),
    // Living Room / Workroom
    share_to_living_room:    bool(prop(page, "Share to Living Room")),
    living_room_visibility:  sel(prop(page, "Living Room Visibility")),
    workroom_mode:           sel(prop(page, "Workroom Mode")),
    // Dates
    start_date:              dateStart(prop(page, "Start Date")),
    target_end_date:         dateStart(prop(page, "Target End Date")),
    last_status_update:      dateStart(prop(page, "Last Status Update")),
    last_meeting_date:       dateStart(prop(page, "Last Meeting Date")),
    notion_created_at:       page.created_time ?? null,
    canonical_project_code:  text(prop(page, "Canonical Project Code")),
    // Supabase timestamps
    created_at:              page.created_time ?? new Date().toISOString(),
    updated_at:              page.last_edited_time ?? new Date().toISOString(),
  };
}

// ─── Notion pagination ────────────────────────────────────────────────────────

async function fetchAllProjects(notion: Client): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: DB_PROJECTS,
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
    // 1. Fetch all projects from Notion
    const pages = await fetchAllProjects(notion);
    stats.fetched = pages.length;

    if (pages.length === 0) {
      return NextResponse.json({ ok: true, ...stats, total_in_supabase: 0 });
    }

    // 2. Transform
    const rows = pages.map(transform);

    // 3. Batch upsert — ON CONFLICT (notion_id) updates all fields
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await sb
        .from("projects")
        .upsert(batch, { onConflict: "notion_id", ignoreDuplicates: false });

      if (error) {
        stats.errors.push(`batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      } else {
        stats.upserted += batch.length;
      }
    }

    // 4. Final count
    const { count } = await sb
      .from("projects")
      .select("*", { count: "exact", head: true });

    // 5. Active breakdown
    const { count: activeCount } = await sb
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("project_status", "Active");

    const { count: updateNeededCount } = await sb
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("update_needed", true);

    return NextResponse.json({
      ok:                  stats.errors.length === 0,
      fetched_from_notion: stats.fetched,
      upserted:            stats.upserted,
      total_in_supabase:   count ?? 0,
      active:              activeCount ?? 0,
      update_needed:       updateNeededCount ?? 0,
      errors:              stats.errors,
    });

  } catch (err) {
    console.error("[sync-projects] Fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
