/**
 * POST /api/update-draft
 *
 * Updates the Content (body) of an Agent Draft. Used by the Outbox inline
 * editor before approval.
 *
 * Phase 2 pattern: Supabase mirror first (instant UI), best-effort push to
 * Notion. Failures retried by /api/cron/push-pending-to-notion.
 *
 * Body: { draftId: string; content: string }
 * Auth: admin session (Clerk).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { applyMirrorEdit, pushPending } from "@/lib/notion-mirror-push";

const MAX_CONTENT = 2000;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const draftId: string = body.draftId;
  const content: string = body.content;

  if (!draftId || typeof content !== "string") {
    return NextResponse.json({ error: "draftId and content required" }, { status: 400 });
  }

  const apply = await applyMirrorEdit({
    table:   "notion_agent_drafts",
    id:      draftId,
    changes: { draft_text: content.slice(0, MAX_CONTENT) },
  });
  if (!apply.ok) {
    return NextResponse.json({ error: "Mirror update failed", detail: apply.error }, { status: 500 });
  }

  const push = await pushPending("notion_agent_drafts", draftId);

  return NextResponse.json({
    ok: true,
    notion_push: push.ok ? "ok" : "pending_retry",
    notion_error: push.ok ? undefined : push.error,
  });
}
