/**
 * PATCH /api/admin/projects/[id]
 *
 * Updates the canonical Supabase `projects` row. Read path is still Notion
 * (Phase 4 will migrate that). This API exists so the portal can write
 * project status fields without touching Notion ahead of the cutoff.
 *
 * Body: { project_status?, current_stage?, engagement_stage?, engagement_model?,
 *         status_summary?, draft_status_update? }
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const PROJECT_STATUSES = new Set([
  "Not started", "In progress", "Active", "On hold", "Completed", "Archived", "Cancelled",
]);
const CURRENT_STAGES = new Set([
  "Discovery", "Scoping", "Proposal", "Kickoff", "Delivery", "Review", "Closed",
]);
const ENGAGEMENT_STAGES = new Set([
  "Lead", "Qualifying", "Proposal", "Negotiation", "Won", "Active", "Closed", "Lost",
]);
const ENGAGEMENT_MODELS = new Set([
  "Consulting", "Venture Studio", "Grant", "Internal", "Mixed",
]);

const ALLOWED_KEYS = new Set([
  "project_status",
  "current_stage",
  "engagement_stage",
  "engagement_model",
  "status_summary",
  "draft_status_update",
]);

type Body = Partial<Record<string, string | null>>;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  // Accept either uuid (Supabase id) or text (notion_id) — query by both.
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Whitelist + enum validation
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === null || v === "") {
      update[k] = null;
      continue;
    }
    if (typeof v !== "string") {
      return NextResponse.json({ error: `${k} must be string or null` }, { status: 400 });
    }
    if (k === "project_status"  && !PROJECT_STATUSES.has(v))  return NextResponse.json({ error: `invalid project_status: ${v}` }, { status: 400 });
    if (k === "current_stage"   && !CURRENT_STAGES.has(v))    return NextResponse.json({ error: `invalid current_stage: ${v}` }, { status: 400 });
    if (k === "engagement_stage"&& !ENGAGEMENT_STAGES.has(v)) return NextResponse.json({ error: `invalid engagement_stage: ${v}` }, { status: 400 });
    if (k === "engagement_model"&& !ENGAGEMENT_MODELS.has(v)) return NextResponse.json({ error: `invalid engagement_model: ${v}` }, { status: 400 });
    update[k] = v;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no updatable fields supplied" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const sb = getSupabaseServerClient();

  // Try uuid pk first; if no match, fall back to notion_id.
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const query = isUuid
    ? sb.from("projects").update(update).eq("id", id).select("*").maybeSingle()
    : sb.from("projects").update(update).eq("notion_id", id).select("*").maybeSingle();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "project not found" }, { status: 404 });

  return NextResponse.json({ ok: true, project: data });
}
