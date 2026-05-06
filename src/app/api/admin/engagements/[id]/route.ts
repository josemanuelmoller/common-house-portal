/**
 * PATCH /api/admin/engagements/[id]
 *
 * Updates an existing row in the canonical Supabase `engagements` table.
 * Used by the inline editor on /admin/clients/[id].
 *
 * Auth: adminGuardApi (mandatory per AGENTS.md API auth rules — every
 * mutating route under /api/* must call this since src/middleware.ts
 * marks /api/* as public to Clerk).
 *
 * Body: any subset of the editable engagement fields (see ALLOWED_KEYS).
 * Returns: { ok: true, row: <updated_row> }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENGAGEMENT_TYPES = new Set(["Client", "Partner", "Investor", "Funder", "Vendor"]);
const RELATIONSHIP_STATUSES = new Set(["Active", "Inactive", "Closed"]);

const ALLOWED_KEYS = new Set([
  "relationship_name",
  "engagement_type",
  "relationship_status",
  "engagement_value",
  "budget_readiness",
  "strategic_exposure",
  "notes",
  "notes_on_terms",
  "territories_covered",
  "org_notion_id",
  "primary_owner_notion_id",
  "ch_value_add_summary",
  "start_date",
  "end_date",
  "expected_close_date",
]);

// Basic UUID v4-ish guard. Engagements use uuid PKs, never short ids.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid engagement id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  // Validate enum fields when present.
  if (
    "relationship_name" in body &&
    (typeof body.relationship_name !== "string" || !body.relationship_name.trim())
  ) {
    return NextResponse.json(
      { error: "relationship_name must be a non-empty string" },
      { status: 400 }
    );
  }
  if (
    body.engagement_type != null &&
    body.engagement_type !== "" &&
    !ENGAGEMENT_TYPES.has(String(body.engagement_type))
  ) {
    return NextResponse.json(
      { error: "engagement_type must be one of Client | Partner | Investor | Funder | Vendor" },
      { status: 400 }
    );
  }
  if (
    body.relationship_status != null &&
    body.relationship_status !== "" &&
    !RELATIONSHIP_STATUSES.has(String(body.relationship_status))
  ) {
    return NextResponse.json(
      { error: "relationship_status must be one of Active | Inactive | Closed" },
      { status: 400 }
    );
  }

  // Build the update payload only from allowed keys.
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined) continue;
    update[k] = v === "" ? null : v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no updatable fields in body" }, { status: 400 });
  }

  // Bump updated_at so the detail page header reflects the edit.
  update.updated_at = new Date().toISOString();

  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("engagements")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "engagement not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, row: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
