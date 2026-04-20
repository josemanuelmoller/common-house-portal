/**
 * POST /api/hall-organizations/sync-notion
 *
 * Bridges a hall_organizations row to a page in CH Organizations [OS v2].
 *
 * Body: { domain: string }
 *
 * Flow:
 *   1. Load the hall_organizations row (must exist).
 *   2. If notion_id already set → fetch the Notion page and refresh our
 *      notion_synced_at. No-op if the page still exists.
 *   3. Otherwise search CH Organizations by Name (contains). If a match is
 *      found, link — no new page created.
 *   4. If no match, create a new Notion page with the minimum viable fields
 *      (Name, Website=domain, Relationship Stage=Active) and link.
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ORGS_DB = "bef1bb86ab2b4cd280b6b33f9034b96c";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

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

  // ── (2) Already linked — verify the Notion page still exists ──────────────
  if (org.notion_id) {
    try {
      const page = await notion.pages.retrieve({ page_id: org.notion_id });
      await sb.from("hall_organizations").update({ notion_synced_at: nowIso }).eq("domain", domain);
      return NextResponse.json({
        ok: true,
        action: "already_linked",
        notion_id: org.notion_id,
        notion_url: (page as { url?: string }).url ?? null,
      });
    } catch {
      // Page was deleted on the Notion side — clear stale id and fall through.
      await sb.from("hall_organizations").update({ notion_id: null, notion_synced_at: null }).eq("domain", domain);
    }
  }

  // ── (3) Search by name ────────────────────────────────────────────────────
  let matchedId: string | null = null;
  let matchedUrl: string | null = null;
  try {
    const search = await notion.databases.query({
      database_id: ORGS_DB,
      filter: { property: "Name", title: { equals: org.name } },
      page_size: 1,
    });
    if (search.results.length > 0) {
      matchedId  = search.results[0].id;
      matchedUrl = (search.results[0] as { url?: string }).url ?? null;
    } else {
      // Try contains as a looser match
      const loose = await notion.databases.query({
        database_id: ORGS_DB,
        filter: { property: "Name", title: { contains: org.name } },
        page_size: 1,
      });
      if (loose.results.length > 0) {
        matchedId  = loose.results[0].id;
        matchedUrl = (loose.results[0] as { url?: string }).url ?? null;
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: "notion search failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  let action: "linked_existing" | "created" = "linked_existing";

  // ── (4) Create a new page if nothing matched ──────────────────────────────
  if (!matchedId) {
    try {
      const created = await notion.pages.create({
        parent: { database_id: ORGS_DB },
        properties: {
          "Name":               { title: [{ type: "text", text: { content: org.name.slice(0, 180) } }] },
          "Website":            { url: `https://${domain}` },
          "Relationship Stage": { select: { name: "Active" } },
        },
      });
      matchedId  = created.id;
      matchedUrl = (created as { url?: string }).url ?? null;
      action = "created";
    } catch (err) {
      return NextResponse.json(
        { error: "notion create failed", detail: err instanceof Error ? err.message : String(err) },
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
    notion_url: matchedUrl,
  });
}
