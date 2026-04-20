/**
 * POST /api/sync-people  [Wave 5 live sync — paired with sync-organizations]
 *
 * Reads ALL people from CH People [OS v2] and upserts into the canonical
 * Supabase `people` table.
 *
 * Design decisions:
 *   - Bridge key: notion_id (stable Notion page ID)
 *   - Idempotent: safe to run repeatedly; ON CONFLICT updates all Notion-sourced fields
 *   - org_notion_id: first relation ID from "Primary Organization" — bridges to organizations table
 *   - relationship_roles + especialidad: stored as JSON arrays (multi_select → TEXT column)
 *   - Contact Warmth, last_contact_date, catchup_suggested: synced from Notion (written by
 *     relationship-warmth-compute skill) — future read paths can query Supabase instead of Notion
 *   - Fetches ALL people (no filter) — complete master table mirror
 *   - Self-referential "Internal Owner" relation intentionally skipped
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-agent-key header.
 * Cron: 0 12 * * 1-5 (noon weekdays, paired with sync-organizations)
 *
 * Source DB: CH People [OS v2] — 1bc0f96f33ca4a9e9ff26844377e81de
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const DB_PEOPLE = "1bc0f96f33ca4a9e9ff26844377e81de";

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
function emailProp(p: NotionPage): string | null {
  return p?.email ?? null;
}
function phoneProp(p: NotionPage): string | null {
  return p?.phone_number ?? null;
}
function numProp(p: NotionPage): number | null {
  return typeof p?.number === "number" ? p.number : null;
}

// ─── Row transform ────────────────────────────────────────────────────────────

function transform(page: NotionPage): Record<string, unknown> {
  const roles       = multiSel(prop(page, "Relationship Roles"));
  const especialidad = multiSel(prop(page, "Especialidad"));

  return {
    notion_id:             page.id,
    full_name:             titleText(prop(page, "Full Name")) ?? "Untitled",
    person_classification: sel(prop(page, "Person Classification")),
    relationship_roles:    roles.length       ? JSON.stringify(roles)       : null,
    rol_interno:           sel(prop(page, "Rol interno")),
    access_role:           sel(prop(page, "Access Role")),
    job_title:             titleText(prop(page, "Job Title / Role")),
    email:                 emailProp(prop(page, "Email")),
    phone:                 phoneProp(prop(page, "Phone")),
    linkedin:              urlProp(prop(page, "LinkedIn")),
    country:               sel(prop(page, "Country")),
    city:                  titleText(prop(page, "City")),
    contact_warmth:        sel(prop(page, "Contact Warmth")),
    last_contact_date:     dateStart(prop(page, "Last Contact Date")),
    catchup_suggested:     bool(prop(page, "Catch-up sugerido")),
    catchup_confidence:    numProp(prop(page, "Confianza catch-up")),
    next_catchup_date:     dateStart(prop(page, "Próximo catch-up")),
    visibility:            sel(prop(page, "Visibility")),
    org_notion_id:         firstRelation(prop(page, "Primary Organization")),
    especialidad:          especialidad.length ? JSON.stringify(especialidad) : null,
    disponibilidad:        sel(prop(page, "Disponibilidad")),
    fee_structure:         sel(prop(page, "Fee Structure")),
    fecha_inicio:          dateStart(prop(page, "Fecha de inicio")),
    notes:                 titleText(prop(page, "Notes")),
    notion_created_at:     page.created_time ?? null,
    created_at:            page.created_time ?? new Date().toISOString(),
    updated_at:            page.last_edited_time ?? new Date().toISOString(),
  };
}

// ─── Notion pagination ────────────────────────────────────────────────────────

async function fetchAllPeople(notion: Client): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: DB_PEOPLE,
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
    const pages = await fetchAllPeople(notion);
    stats.fetched = pages.length;

    if (pages.length === 0) {
      return NextResponse.json({ ok: true, ...stats, total_in_supabase: 0 });
    }

    const rows = pages.map(transform);

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await sb
        .from("people")
        .upsert(batch, { onConflict: "notion_id", ignoreDuplicates: false });

      if (error) {
        stats.errors.push(`batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      } else {
        stats.upserted += batch.length;
      }
    }

    const { count } = await sb
      .from("people")
      .select("*", { count: "exact", head: true });

    const { count: internalCount } = await sb
      .from("people")
      .select("*", { count: "exact", head: true })
      .eq("person_classification", "Internal");

    const { count: catchupCount } = await sb
      .from("people")
      .select("*", { count: "exact", head: true })
      .eq("catchup_suggested", true);

    const { count: withEmailCount } = await sb
      .from("people")
      .select("*", { count: "exact", head: true })
      .not("email", "is", null);

    return NextResponse.json({
      ok:                  stats.errors.length === 0,
      fetched_from_notion: stats.fetched,
      upserted:            stats.upserted,
      total_in_supabase:   count ?? 0,
      internal:            internalCount ?? 0,
      catchup_flagged:     catchupCount ?? 0,
      with_email:          withEmailCount ?? 0,
      errors:              stats.errors,
    });

  } catch (err) {
    console.error("[sync-people] Fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
