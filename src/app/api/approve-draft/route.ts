/**
 * POST /api/approve-draft
 *
 * Approves or requests revision on an Agent Draft.
 * Phase 2 pattern: Supabase mirror first (instant UI), best-effort push to Notion.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { applyMirrorEdit, pushPending } from "@/lib/notion-mirror-push";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { draftId, action } = await req.json();
  if (!draftId || !action) {
    return NextResponse.json({ error: "draftId and action required" }, { status: 400 });
  }

  const validActions = ["approve", "revision"] as const;
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "action must be approve or revision" }, { status: 400 });
  }

  const statusMap = {
    approve:  "Approved",
    revision: "Revision Requested",
  } as const;
  const newStatus = statusMap[action as keyof typeof statusMap];

  const apply = await applyMirrorEdit({
    table:   "notion_agent_drafts",
    id:      draftId,
    changes: { status: newStatus },
  });
  if (!apply.ok) {
    return NextResponse.json({ error: "Mirror update failed", detail: apply.error }, { status: 500 });
  }

  const push = await pushPending("notion_agent_drafts", draftId);

  return NextResponse.json({
    ok: true,
    status: newStatus,
    notion_push: push.ok ? "ok" : "pending_retry",
    notion_error: push.ok ? undefined : push.error,
  });
}
