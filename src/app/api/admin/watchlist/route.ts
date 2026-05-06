/**
 * /api/admin/watchlist
 *
 *   GET  → list non-archived watchlist_entities rows.
 *   POST → create a new row.
 *
 * Auth: adminGuardApi() (mandatory per AGENTS.md API auth rules).
 *
 * Phase-5 schema note: `watchlist_entities` does not yet have a dedicated
 * status/archived column. Soft-archive is implemented via the `payload`
 * jsonb escape hatch (see SUPABASE_CONSOLIDATION_FREEZE.md §10.3) — we
 * mark `payload->>'archived' = 'true'` on DELETE and exclude those rows
 * from the GET list.
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

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("watchlist_entities")
    .select(
      "id, notion_id, name, watch_type, url, themes, notes, payload, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  type Row = {
    id: string;
    notion_id: string | null;
    name: string;
    watch_type: string | null;
    url: string | null;
    themes: string[] | null;
    notes: string | null;
    payload: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
  };
  // Filter out soft-archived rows (payload.archived === true).
  const rows = ((data as Row[] | null) ?? []).filter(
    (r) => r.payload?.archived !== true
  );

  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
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

  const insert: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined) continue;
    insert[k] = v === "" ? null : v;
  }
  const nowIso = new Date().toISOString();
  insert.created_at = nowIso;
  insert.updated_at = nowIso;

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("watchlist_entities")
    .insert(insert)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, row: data });
}
