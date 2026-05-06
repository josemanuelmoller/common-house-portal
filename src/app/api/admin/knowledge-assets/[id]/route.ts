/**
 * /api/admin/knowledge-assets/[id]
 *
 *   POST  → create a new knowledge_assets row when [id] === "new".
 *   PATCH → update an existing row (matched by uuid `id` or by `notion_id`).
 *
 * Used by <KnowledgeAssetEditor> on /admin/knowledge-assets/[id].
 *
 * Auth: adminGuardApi() (mandatory per AGENTS.md API auth rules).
 *
 * Phase-5 note: writes go ONLY to the canonical Supabase table.
 * No Notion side-effects (post-cutoff freeze).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ASSET_TYPES = new Set([
  "Playbook",
  "Template",
  "Reference",
  "Insight",
  "Pattern",
  "Decision Record",
]);
const STATUSES = new Set(["Draft", "Live", "Archived"]);

const ALLOWED_KEYS = new Set([
  "title",
  "asset_type",
  "status",
  "summary",
  "body_md",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(body: Record<string, unknown>): string | null {
  if (
    "title" in body &&
    (typeof body.title !== "string" || !body.title.trim())
  ) {
    return "title must be a non-empty string";
  }
  if (
    body.asset_type != null &&
    body.asset_type !== "" &&
    !ASSET_TYPES.has(String(body.asset_type))
  ) {
    return `invalid asset_type: ${String(body.asset_type)}`;
  }
  if (
    body.status != null &&
    body.status !== "" &&
    !STATUSES.has(String(body.status))
  ) {
    return `invalid status: ${String(body.status)}`;
  }
  return null;
}

function buildUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined) continue;
    update[k] = v === "" ? null : v;
  }
  return update;
}

// ── POST (create when id === "new") ────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (id !== "new") {
    return NextResponse.json(
      { error: "POST only supported on /api/admin/knowledge-assets/new" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const verr = validate(body);
  if (verr) return NextResponse.json({ error: verr }, { status: 400 });

  const insert = buildUpdate(body);
  const nowIso = new Date().toISOString();
  insert.created_at = nowIso;
  insert.updated_at = nowIso;
  // Default status when not supplied.
  if (insert.status == null) insert.status = "Draft";

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("knowledge_assets")
    .insert(insert)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, knowledge_asset: data });
}

// ── PATCH (update existing row) ────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || id === "new") {
    return NextResponse.json({ error: "id required for PATCH" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const verr = validate(body);
  if (verr) return NextResponse.json({ error: verr }, { status: 400 });

  const update = buildUpdate(body);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no updatable fields supplied" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const sb = getSupabaseServerClient();
  const isUuid = UUID_RE.test(id);
  const query = isUuid
    ? sb.from("knowledge_assets").update(update).eq("id", id).select("*").maybeSingle()
    : sb.from("knowledge_assets").update(update).eq("notion_id", id).select("*").maybeSingle();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "knowledge_asset not found" }, { status: 404 });

  return NextResponse.json({ ok: true, knowledge_asset: data });
}
