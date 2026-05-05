import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/mark-grant-interest
 *
 * Records explicit human interest in a grant from the Grants Desk.
 * Creates (or updates) a Grant-typed row in `public.opportunities` and flags
 * `is_followed = true`.
 *
 * notion-cutoff-2026-06-02: replaced by canonical writes to opportunities (Supabase).
 * Per docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.2 the canonical store is
 * `public.opportunities`. The org/funder relation also lives in `public.organizations`
 * (matched by lower(name)).
 */

// Verified property names from Notion schema (2026-04-13)
// Opportunity Status: New | Qualifying | Active | Stalled | Closed Won | Closed Lost
// Priority: P1 — Act Now | P2 — This Quarter | P3 — Backlog | P4 — Watch
// Account / Organization: relation to CH Organizations
// Opportunity Type: Grant | CH Sale | Partnership | Investor Match | etc.

const PRIORITY_MAP: Record<string, string> = {
  "P1": "P1 — Act Now",
  "P2": "P2 — This Quarter",
  "P3": "P3 — Backlog",
  "P4": "P4 — Watch",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const funderName: string = body.funder ?? "";
  const program: string = body.program ?? "";
  const startup: string = body.startup ?? "CH";
  const priority: string = body.priority ?? ""; // "P1"|"P2"|"P3"|"P4"|"" (no priority)

  if (!funderName.trim()) {
    return NextResponse.json(
      { error: "funder is required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const today  = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const sb     = getSupabaseServerClient();

  // 1. Look up funder org in `organizations` (replaces Notion relation lookup).
  // notion-cutoff-2026-06-02: replaced by canonical read from organizations
  // const orgsRes = await notion.databases.query({ database_id: ORGS_DB, filter: { property: "Name", title: { contains: funderName } }, page_size: 1 });
  let funderOrgNotionId: string | null = null;
  try {
    const { data: org } = await sb
      .from("organizations")
      .select("notion_id")
      .ilike("name", `%${funderName}%`)
      .limit(1)
      .maybeSingle();
    funderOrgNotionId = (org?.notion_id as string | null) ?? null;
  } catch {
    // Org lookup failed — proceed without relation
  }

  const opportunityName = program
    ? `Grant — ${program} · ${startup}`
    : `Grant — ${funderName} · ${startup}`;

  // 2. Search for existing Grant opportunity for this funder to avoid duplicates.
  // notion-cutoff-2026-06-02: replaced by canonical read from opportunities
  // const existing = await notion.databases.query({ database_id: DB.opportunities, filter: { property: "Opportunity Name", title: { contains: `Grant — ${funderName}` } }, page_size: 1 });
  let existingId: string | null = null;
  try {
    const { data: existingRow } = await sb
      .from("opportunities")
      .select("notion_id")
      .ilike("title", `Grant — ${funderName}%`)
      .limit(1)
      .maybeSingle();
    existingId = (existingRow?.notion_id as string | null) ?? null;
  } catch {
    // Lookup failed — proceed to create
  }

  const fullPriority = priority ? PRIORITY_MAP[priority] ?? null : null;
  const triggerSignal = `Editado desde Grants Desk — ${today}`;

  let opportunityRowId: string | null = null;
  let opportunityNotionId: string | null = existingId;

  try {
    if (existingId) {
      // notion-cutoff-2026-06-02: replaced by canonical write to opportunities
      // await notion.pages.update({ page_id: existingId, properties: { ...selects, "Account / Organization": { relation: [{ id: funderPageId }] } } });
      const updatePayload: Record<string, unknown> = {
        status:           "Qualifying",
        follow_up_status: "Needed",
        opportunity_type: "Grant",
        trigger_signal:   triggerSignal,
        pending_action:   triggerSignal,
        updated_at:       nowIso,
      };
      if (fullPriority) updatePayload.priority = fullPriority;
      if (funderOrgNotionId) updatePayload.org_notion_id = funderOrgNotionId;

      const { data, error } = await sb
        .from("opportunities")
        .update(updatePayload)
        .eq("notion_id", existingId)
        .select("id")
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: "Supabase update failed", detail: error.message },
          { status: 500, headers: corsHeaders() }
        );
      }
      opportunityRowId = (data?.id as string | null) ?? null;
    } else {
      // notion-cutoff-2026-06-02: replaced by canonical write to opportunities
      // await notion.pages.create({ parent: { database_id: DB.opportunities }, properties: { "Opportunity Name": ..., ...selects, "Account / Organization": ... } });
      const insertPayload: Record<string, unknown> = {
        title:            opportunityName,
        status:           "Qualifying",
        follow_up_status: "Needed",
        opportunity_type: "Grant",
        scope:            startup === "CH" ? "CH" : "Portfolio",
        trigger_signal:   triggerSignal,
        pending_action:   triggerSignal,
        org_notion_id:    funderOrgNotionId,
        is_active:        true,
        is_archived:      false,
        is_legacy:        false,
        notion_created_at: nowIso,
        created_at:       nowIso,
        updated_at:       nowIso,
      };
      if (fullPriority) insertPayload.priority = fullPriority;

      const { data, error } = await sb
        .from("opportunities")
        .insert(insertPayload)
        .select("id, notion_id")
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Supabase insert failed", detail: error.message },
          { status: 500, headers: corsHeaders() }
        );
      }
      opportunityRowId    = (data?.id as string | null) ?? null;
      opportunityNotionId = (data?.notion_id as string | null) ?? null;
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Supabase write failed", detail: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }

  // Calling mark-grant-interest IS an explicit human Follow signal. Mirror
  // that to Supabase so the is_followed gate admits the grant into Hall / STB
  // / CoS.
  try {
    const user = await currentUser();
    const actorEmail = user?.primaryEmailAddress?.emailAddress ?? "mark-grant-interest";
    const followUpdate: Record<string, unknown> = {
      is_followed:     true,
      followed_at:     nowIso,
      followed_by:     actorEmail,
      unfollowed_at:   null,
      unfollow_reason: null,
      updated_at:      nowIso,
    };
    if (opportunityRowId) {
      await sb.from("opportunities").update(followUpdate).eq("id", opportunityRowId);
    } else if (opportunityNotionId) {
      await sb.from("opportunities").update(followUpdate).eq("notion_id", opportunityNotionId);
    }
  } catch { /* non-critical */ }

  return NextResponse.json(
    {
      ok: true,
      opportunityId:  opportunityNotionId ?? opportunityRowId ?? "",
      notionUrl:      "",
      funderResolved: !!funderOrgNotionId,
      updated:        !!existingId,
      opportunityName,
    },
    { headers: corsHeaders() }
  );
}
