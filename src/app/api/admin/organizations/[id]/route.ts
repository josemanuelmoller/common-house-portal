/**
 * PATCH /api/admin/organizations/[id]
 *
 * Updates the canonical Supabase `organizations` row. Used by the
 * inline OrganizationEditor on /admin/hall/organizations/[domain].
 *
 * Body subset of: { name, relationship_stage, org_category, country, city,
 *                   website, notes, engagement_type, engagement_value }
 *
 * The route id may be either the uuid `id` or the `notion_id` — the API
 * tries uuid first then falls back to notion_id (mirrors evidence/projects).
 *
 * Auth: adminGuardApi() (mandatory per AGENTS.md API auth rules).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RELATIONSHIP_STAGES = new Set([
  "Prospect",
  "Active Client",
  "Lapsed",
  "Archived",
  "Partner",
  "Investor",
  "Funder",
  "Vendor",
]);
const ORG_CATEGORIES = new Set(["Startup", "Corporate", "NGO", "Public", "Other"]);
const ENGAGEMENT_TYPES = new Set(["Client", "Partner", "Investor", "Funder", "Vendor"]);

const ALLOWED_KEYS = new Set([
  "name",
  "relationship_stage",
  "org_category",
  "country",
  "city",
  "website",
  "notes",
  "engagement_type",
  "engagement_value",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  // Required field validation when present.
  if (
    "name" in body &&
    (typeof body.name !== "string" || !body.name.trim())
  ) {
    return NextResponse.json(
      { error: "name must be a non-empty string" },
      { status: 400 }
    );
  }
  if (
    body.relationship_stage != null &&
    body.relationship_stage !== "" &&
    !RELATIONSHIP_STAGES.has(String(body.relationship_stage))
  ) {
    return NextResponse.json(
      { error: `invalid relationship_stage: ${String(body.relationship_stage)}` },
      { status: 400 }
    );
  }
  if (
    body.org_category != null &&
    body.org_category !== "" &&
    !ORG_CATEGORIES.has(String(body.org_category))
  ) {
    return NextResponse.json(
      { error: `invalid org_category: ${String(body.org_category)}` },
      { status: 400 }
    );
  }
  if (
    body.engagement_type != null &&
    body.engagement_type !== "" &&
    !ENGAGEMENT_TYPES.has(String(body.engagement_type))
  ) {
    return NextResponse.json(
      { error: `invalid engagement_type: ${String(body.engagement_type)}` },
      { status: 400 }
    );
  }
  if (
    body.engagement_value != null &&
    body.engagement_value !== "" &&
    typeof body.engagement_value !== "number"
  ) {
    return NextResponse.json(
      { error: "engagement_value must be a number or null" },
      { status: 400 }
    );
  }

  // Build whitelisted update payload.
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined) continue;
    update[k] = v === "" ? null : v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no updatable fields supplied" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const sb = getSupabaseServerClient();
  const isUuid = UUID_RE.test(id);
  const query = isUuid
    ? sb.from("organizations").update(update).eq("id", id).select("*").maybeSingle()
    : sb.from("organizations").update(update).eq("notion_id", id).select("*").maybeSingle();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "organization not found" }, { status: 404 });

  return NextResponse.json({ ok: true, organization: data });
}
