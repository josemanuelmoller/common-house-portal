/**
 * Resolve a decision item from the portal.
 *
 * Post-2026-05-08: writes directly to canonical `decision_items`. The legacy
 * mirror-push pattern (Notion + Supabase mirror in one call) was retired
 * ahead of the 2026-06-02 Notion freeze cutoff.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { updateCanonicalRow } from "@/lib/canonical-write";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const id: string = body.id ?? "";
  const action: string = body.action ?? "resolve"; // "resolve" | "dismiss"
  const note: string = body.note ?? "";

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const statusMap: Record<string, string> = {
    resolve: "Resolved",
    dismiss: "Dismissed",
  };
  const newStatus = statusMap[action] ?? "Resolved";

  // Update canonical decision_items row. UI sees the new state on refresh.
  const changes: Record<string, unknown> = { status: newStatus };
  if (note) changes.notes_raw = note;

  const apply = await updateCanonicalRow({
    table:   "notion_decision_items",
    id,
    changes,
  });
  if (!apply.ok) {
    return NextResponse.json(
      { error: "Decision update failed", detail: apply.error },
      { status: 500, headers: corsHeaders() }
    );
  }

  return NextResponse.json(
    { ok: true, id, status: newStatus },
    { headers: corsHeaders() }
  );
}
