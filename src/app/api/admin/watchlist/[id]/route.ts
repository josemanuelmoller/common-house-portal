/**
 * /api/admin/watchlist/[id]
 *
 *   PATCH  → update fields on a watchlist_entities row.
 *   DELETE → soft-archive (sets payload.archived = true, since the table
 *            has no dedicated status column — see freeze §10.3).
 *
 * Auth: adminGuardApi() (mandatory per AGENTS.md API auth rules).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WATCH_TYPES = new Set([
  "Competitor",
  "Trend",
  "Regulation",
  "Investor",
  "Funder",
  "Partner",
  "Other",
]);

const ALLOWED_KEYS = new Set(["name", "watch_type", "url", "themes", "notes"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (
    "name" in body &&
    (typeof body.name !== "string" || !body.name.trim())
  ) {
    return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
  }
  if (
    body.watch_type != null &&
    body.watch_type !== "" &&
    !WATCH_TYPES.has(String(body.watch_type))
  ) {
    return NextResponse.json(
      { error: `invalid watch_type: ${String(body.watch_type)}` },
      { status: 400 }
    );
  }
  if (body.themes != null && !Array.isArray(body.themes)) {
    return NextResponse.json(
      { error: "themes must be an array of strings" },
      { status: 400 }
    );
  }

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
  const { data, error } = await sb
    .from("watchlist_entities")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "watchlist entry not found" }, { status: 404 });
  return NextResponse.json({ ok: true, row: data });
}

// Soft-delete via payload.archived = true (no native status column on the
// table — Phase 1 escape hatch per freeze §10.3).
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  // Read existing payload so we don't clobber other keys.
  const { data: existing, error: readErr } = await sb
    .from("watchlist_entities")
    .select("payload")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 502 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const existingPayload =
    (existing as { payload: Record<string, unknown> | null }).payload ?? {};
  const nextPayload = {
    ...existingPayload,
    archived: true,
    archived_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from("watchlist_entities")
    .update({
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
