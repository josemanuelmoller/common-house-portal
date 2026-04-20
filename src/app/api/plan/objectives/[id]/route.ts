/**
 * /api/plan/objectives/[id]
 *
 * GET    — fetch one objective
 * PATCH  — partial update (most fields except id, year, created_at)
 * DELETE — soft-delete (sets status=dropped + dropped_at). Pass ?hard=true for real delete.
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "achieved", "slipped", "dropped"] as const;
const TIERS = ["high", "mid", "low"] as const;
const METRIC_TYPES = [
  "revenue_sum", "revenue_pipeline", "contracts_count", "client_count_by_type",
  "milestone_binary", "event_attended", "hiring_filled", "asset_published",
  "mou_signed", "geo_spread", "custom_sql", "manual",
] as const;
const AREAS = ["commercial", "partnerships", "product", "brand", "ops", "funding"] as const;
const OBJECTIVE_TYPES = ["revenue", "milestone", "asset", "client_goal", "event", "hiring"] as const;

type RouteCtx = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin()
    .from("strategic_objectives")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ objective: data });
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

const ALLOWED_FIELDS = new Set([
  "quarter", "area", "objective_type", "tier", "title", "description",
  "target_value", "target_unit", "current_value", "status",
  "metric_type", "metric_params", "linked_opportunities", "linked_projects",
  "linked_people", "notes",
]);

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  // Validate enum values if present
  if (patch.tier && !TIERS.includes(patch.tier as typeof TIERS[number])) {
    return NextResponse.json({ error: `tier must be one of ${TIERS.join(", ")}` }, { status: 400 });
  }
  if (patch.status && !STATUSES.includes(patch.status as typeof STATUSES[number])) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (patch.metric_type && !METRIC_TYPES.includes(patch.metric_type as typeof METRIC_TYPES[number])) {
    return NextResponse.json({ error: `metric_type must be one of ${METRIC_TYPES.join(", ")}` }, { status: 400 });
  }
  if (patch.area && !AREAS.includes(patch.area as typeof AREAS[number])) {
    return NextResponse.json({ error: `area must be one of ${AREAS.join(", ")}` }, { status: 400 });
  }
  if (patch.objective_type && !OBJECTIVE_TYPES.includes(patch.objective_type as typeof OBJECTIVE_TYPES[number])) {
    return NextResponse.json({ error: `objective_type must be one of ${OBJECTIVE_TYPES.join(", ")}` }, { status: 400 });
  }
  if (patch.quarter !== undefined && patch.quarter !== null) {
    const qn = Number(patch.quarter);
    if (!Number.isInteger(qn) || qn < 1 || qn > 4) {
      return NextResponse.json({ error: "quarter must be 1-4 or null" }, { status: 400 });
    }
  }

  // If status flips to achieved and no achieved_at, stamp it now
  if (patch.status === "achieved") {
    patch.achieved_at = new Date().toISOString();
  }
  if (patch.status === "dropped") {
    patch.dropped_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin()
    .from("strategic_objectives")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ objective: data });
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;

  const hard = new URL(req.url).searchParams.get("hard") === "true";

  if (hard) {
    const { error } = await supabaseAdmin()
      .from("strategic_objectives")
      .delete()
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: "hard" });
  }

  // Soft delete — mark as dropped
  const { data, error } = await supabaseAdmin()
    .from("strategic_objectives")
    .update({ status: "dropped", dropped_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: "soft", objective: data });
}
