/**
 * PATCH /api/admin/evidence/[id]
 *
 * Updates the canonical Supabase `evidence` row. Read path is still Notion
 * for the OS Center; this API exists so the portal can edit evidence
 * fields without touching Notion ahead of cutoff 2026-06-02.
 *
 * Body subset of: { evidence_statement, validation_status, confidence_level,
 *                   reusability_level, sensitivity_level, evidence_type,
 *                   topics, affected_theme, geography, workstream,
 *                   stakeholder_function, resolution_status }
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const VALIDATION_STATUSES = new Set(["New", "Reviewed", "Validated", "Rejected", "Superseded", "Archived"]);
const CONFIDENCE = new Set(["Low", "Medium", "High"]);
const REUSABILITY = new Set(["Single-use", "Candidate-reusable", "Reusable"]);
const SENSITIVITY = new Set(["Low", "Medium", "High", "Confidential"]);
const RESOLUTION = new Set(["Open", "Resolved", "Stale"]);
const EVIDENCE_TYPES = new Set([
  "Decision", "Blocker", "Dependency", "Requirement", "Outcome",
  "Process Step", "Insight", "Quote", "Metric", "Artifact",
]);

const ALLOWED_KEYS = new Set([
  "evidence_statement",
  "validation_status",
  "confidence_level",
  "reusability_level",
  "sensitivity_level",
  "evidence_type",
  "topics",
  "affected_theme",
  "geography",
  "workstream",
  "stakeholder_function",
  "resolution_status",
]);

type Body = Partial<Record<string, string | null>>;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    if (k === "validation_status" && !VALIDATION_STATUSES.has(v))
      return NextResponse.json({ error: `invalid validation_status: ${v}` }, { status: 400 });
    if (k === "confidence_level" && !CONFIDENCE.has(v))
      return NextResponse.json({ error: `invalid confidence_level: ${v}` }, { status: 400 });
    if (k === "reusability_level" && !REUSABILITY.has(v))
      return NextResponse.json({ error: `invalid reusability_level: ${v}` }, { status: 400 });
    if (k === "sensitivity_level" && !SENSITIVITY.has(v))
      return NextResponse.json({ error: `invalid sensitivity_level: ${v}` }, { status: 400 });
    if (k === "resolution_status" && !RESOLUTION.has(v))
      return NextResponse.json({ error: `invalid resolution_status: ${v}` }, { status: 400 });
    if (k === "evidence_type" && !EVIDENCE_TYPES.has(v))
      return NextResponse.json({ error: `invalid evidence_type: ${v}` }, { status: 400 });
    update[k] = v;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no updatable fields supplied" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();
  if (update.validation_status === "Reviewed" || update.validation_status === "Validated") {
    update.reviewed_at = new Date().toISOString().slice(0, 10);
  }

  const sb = getSupabaseServerClient();
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const query = isUuid
    ? sb.from("evidence").update(update).eq("id", id).select("*").maybeSingle()
    : sb.from("evidence").update(update).eq("notion_id", id).select("*").maybeSingle();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "evidence not found" }, { status: 404 });

  return NextResponse.json({ ok: true, evidence: data });
}
