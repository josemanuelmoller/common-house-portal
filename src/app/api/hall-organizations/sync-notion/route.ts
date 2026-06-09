/**
 * POST /api/hall-organizations/sync-notion
 *
 * Bridges a hall_organizations row to a row in the canonical `organizations`
 * Supabase table. This route was originally a Notion-side sync; per the
 * 2026-06-02 cutoff (docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.7) it now
 * operates entirely on Supabase. The legacy URL path is kept so the existing
 * "sync-notion" button on Hall org detail keeps working until that UI is
 * renamed.
 *
 * Body: { domain: string }
 *
 * Flow:
 *   1. Load the hall_organizations row (must exist).
 *   2. If `notion_id` (now used as a free-form FK to `organizations.notion_id`)
 *      is already set → confirm the canonical organizations row still exists
 *      and refresh `notion_synced_at`.
 *   3. Otherwise search organizations by name (case-insensitive). If a match
 *      is found, link — no new row created.
 *   4. If no match, insert a new `organizations` row with minimum fields and
 *      link `hall_organizations.notion_id` to that row.
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
// notion-cutoff-2026-06-02: removed; canonical writes target the `organizations` Supabase table.
// import { Client } from "@notionhq/client";
// const notion = new Client({ auth: process.env.NOTION_API_KEY });
// const ORGS_DB = "bef1bb86ab2b4cd280b6b33f9034b96c";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logServerError } from "@/lib/debug-log";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { domain?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const domain = (body.domain ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const sb = getSupabaseServerClient();
  const { data: org, error } = await sb
    .from("hall_organizations")
    .select("domain, name, notion_id, notion_synced_at, notes")
    .eq("domain", domain)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!org)  return NextResponse.json({ error: "org not registered yet — tag it first" }, { status: 404 });

  const nowIso = new Date().toISOString();

  // ── (2) Already linked — verify the canonical organizations row still exists ─
  if (org.notion_id) {
    // notion-cutoff-2026-06-02: replaced by canonical lookup on organizations (Supabase).
    // try { const page = await notion.pages.retrieve({ page_id: org.notion_id }); ... } catch { /* clear */ }
    const { data: existing } = await sb
      .from("organizations")
      .select("notion_id")
      .eq("notion_id", org.notion_id)
      .maybeSingle();
    if (existing) {
      await sb.from("hall_organizations").update({ notion_synced_at: nowIso }).eq("domain", domain);
      return NextResponse.json({
        ok: true,
        action: "already_linked",
        notion_id: org.notion_id,
        notion_url: null,
      });
    }
    // Row was deleted on the canonical side — clear stale id and fall through.
    await sb.from("hall_organizations").update({ notion_id: null, notion_synced_at: null }).eq("domain", domain);
  }

  // ── (3) Search organizations by name (case-insensitive) ───────────────────
  // notion-cutoff-2026-06-02: replaced by Supabase ilike search on organizations.
  // const search = await notion.databases.query({ database_id: ORGS_DB, filter: { property: "Name", title: { equals: org.name } }, page_size: 1 });
  let matchedId: string | null = null;
  try {
    const exactRes = await sb
      .from("organizations")
      .select("id, notion_id, name")
      .ilike("name", org.name)
      .limit(1);
    if (exactRes.data && exactRes.data.length > 0) {
      const row = exactRes.data[0] as { id: string; notion_id: string | null };
      matchedId = row.notion_id ?? row.id;
    } else {
      const looseRes = await sb
        .from("organizations")
        .select("id, notion_id, name")
        .ilike("name", `%${org.name}%`)
        .limit(1);
      if (looseRes.data && looseRes.data.length > 0) {
        const row = looseRes.data[0] as { id: string; notion_id: string | null };
        matchedId = row.notion_id ?? row.id;
      }
    }
  } catch (err) {
    // Notion search errors can include workspace IDs / token error names.
    await logServerError("api/hall-organizations/sync-notion", err, { phase: "org_search" });
    return NextResponse.json(
      { error: "organizations search failed" },
      { status: 502 },
    );
  }

  let action: "linked_existing" | "created" = "linked_existing";

  // ── (4) Create a new organizations row if nothing matched ────────────────
  if (!matchedId) {
    // notion-cutoff-2026-06-02: replaced by canonical insert on organizations (Supabase).
    // Notion → Supabase column mapping:
    //   "Name"               → name
    //   "Website"            → website
    //   "Relationship Stage" → relationship_stage
    //
    // const created = await notion.pages.create({
    //   parent: { database_id: ORGS_DB },
    //   properties: {
    //     "Name":               { title: [...] },
    //     "Website":            { url: `https://${domain}` },
    //     "Relationship Stage": { select: { name: "Active" } },
    //   },
    // });
    try {
      const { data: created, error: insertErr } = await sb
        .from("organizations")
        .insert({
          name:               org.name.slice(0, 180),
          website:            `https://${domain}`,
          relationship_stage: "Active",
        })
        .select("id, notion_id")
        .single();
      if (insertErr || !created) {
        return NextResponse.json(
          { error: "organizations insert failed", detail: insertErr?.message ?? "no row returned" },
          { status: 502 },
        );
      }
      matchedId = (created.notion_id as string | null) ?? (created.id as string);
      action = "created";
    } catch (err) {
      await logServerError("api/hall-organizations/sync-notion", err, { phase: "org_insert" });
      return NextResponse.json(
        { error: "organizations insert failed" },
        { status: 502 },
      );
    }
  }

  // Persist the link locally.
  await sb.from("hall_organizations").update({
    notion_id:        matchedId,
    notion_synced_at: nowIso,
    updated_at:       nowIso,
  }).eq("domain", domain);

  return NextResponse.json({
    ok: true,
    action,
    notion_id:  matchedId,
    notion_url: null,
  });
}
