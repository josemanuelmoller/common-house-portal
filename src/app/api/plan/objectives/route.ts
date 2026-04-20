/**
 * /api/plan/objectives
 *
 * GET   — list objectives (filter by ?year= and ?quarter=)
 * POST  — create new objective
 *
 * Auth: adminGuardApi() — only CH admins can read/write the plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const OBJECTIVE_TYPES = ["revenue", "milestone", "asset", "client_goal", "event", "hiring"] as const;
const TIERS = ["high", "mid", "low"] as const;
const STATUSES = ["active", "achieved", "slipped", "dropped"] as const;
const AREAS = ["commercial", "partnerships", "product", "brand", "ops", "funding"] as const;
const METRIC_TYPES = [
  "revenue_sum", "revenue_pipeline", "contracts_count", "client_count_by_type",
  "milestone_binary", "event_attended", "hiring_filled", "asset_published",
  "mou_signed", "geo_spread", "custom_sql", "manual",
] as const;

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const url = new URL(req.url);
  const year = url.searchParams.get("year");
  const quarter = url.searchParams.get("quarter");

  let q = supabaseAdmin()
    .from("strategic_objectives")
    .select("*")
    .order("quarter", { ascending: true, nullsFirst: true })
    .order("tier", { ascending: true })
    .order("created_at", { ascending: true });

  if (year) q = q.eq("year", Number(year));
  if (quarter === "null") q = q.is("quarter", null);
  else if (quarter) q = q.eq("quarter", Number(quarter));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ objectives: data ?? [] });
}

// ─── POST ────────────────────────────────────────────────────────────────────

type CreateBody = {
  year: number;
  quarter?: number | null;
  area: string;
  objective_type: string;
  tier?: string;
  title: string;
  description?: string;
  target_value?: number | null;
  target_unit?: string;
  metric_type?: string;
  metric_params?: Record<string, unknown>;
  notes?: string;
};

function validate(body: Partial<CreateBody>): string | null {
  if (!body.title || body.title.trim().length === 0) return "title is required";
  if (!body.year || body.year < 2020 || body.year > 2100) return "year is required and must be realistic";
  if (body.quarter !== null && body.quarter !== undefined) {
    if (!Number.isInteger(body.quarter) || body.quarter < 1 || body.quarter > 4) return "quarter must be 1-4 or null";
  }
  if (!body.area || !AREAS.includes(body.area as typeof AREAS[number])) return `area must be one of ${AREAS.join(", ")}`;
  if (!body.objective_type || !OBJECTIVE_TYPES.includes(body.objective_type as typeof OBJECTIVE_TYPES[number])) {
    return `objective_type must be one of ${OBJECTIVE_TYPES.join(", ")}`;
  }
  if (body.tier && !TIERS.includes(body.tier as typeof TIERS[number])) return `tier must be one of ${TIERS.join(", ")}`;
  if (body.metric_type && !METRIC_TYPES.includes(body.metric_type as typeof METRIC_TYPES[number])) {
    return `metric_type must be one of ${METRIC_TYPES.join(", ")}`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Partial<CreateBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const record = {
    year: body.year,
    quarter: body.quarter ?? null,
    area: body.area,
    objective_type: body.objective_type,
    tier: body.tier ?? "mid",
    title: body.title!.trim(),
    description: body.description ?? null,
    target_value: body.target_value ?? null,
    target_unit: body.target_unit ?? null,
    original_target: body.target_value ?? null,
    status: "active" as const,
    metric_type: body.metric_type ?? "manual",
    metric_params: body.metric_params ?? {},
    notes: body.notes ?? null,
  };

  const { data, error } = await supabaseAdmin()
    .from("strategic_objectives")
    .insert(record)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ objective: data }, { status: 201 });
}

export { OBJECTIVE_TYPES, TIERS, STATUSES, AREAS, METRIC_TYPES };
