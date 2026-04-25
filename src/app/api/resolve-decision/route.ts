/**
 * Resolve a decision item from the portal.
 *
 * Phase 2 pattern: Supabase mirror is updated immediately (instant UI feedback);
 * the same change is queued as `pending_notion_push` and pushed to Notion
 * best-effort in the same request. If the Notion push fails, the cron retry
 * route (/api/cron/push-pending-to-notion) will retry it.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { applyMirrorEdit, pushPending } from "@/lib/notion-mirror-push";

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

  // 1) Update Supabase mirror — UI sees the new state instantly on refresh.
  const changes: Record<string, unknown> = { status: newStatus };
  if (note) changes.resolution_note = note;

  const apply = await applyMirrorEdit({
    table:   "notion_decision_items",
    id,
    changes,
  });
  if (!apply.ok) {
    return NextResponse.json(
      { error: "Mirror update failed", detail: apply.error },
      { status: 500, headers: corsHeaders() }
    );
  }

  // 2) Best-effort push to Notion. Failure here is non-fatal — the cron retry
  //    will pick it up. We surface the error in the response for visibility.
  const push = await pushPending("notion_decision_items", id);

  return NextResponse.json(
    {
      ok: true,
      id,
      status: newStatus,
      notion_push: push.ok ? "ok" : "pending_retry",
      notion_error: push.ok ? undefined : push.error,
    },
    { headers: corsHeaders() }
  );
}
