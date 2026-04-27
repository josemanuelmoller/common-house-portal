/**
 * POST /api/admin/approve-project-update
 *
 * Portal-native action for the "Flagged for update" banner on project pages.
 *
 * Actions:
 *   approve — copies Draft Status Update → Status Summary, clears the draft,
 *             unchecks "Project Update Needed?"
 *   dismiss — unchecks "Project Update Needed?" only (no status change)
 *
 * Auth: Clerk admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { applyMirrorEdit, pushPending } from "@/lib/notion-mirror-push";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, action, draftText } = await req.json() as {
    projectId: string;
    action: "approve" | "dismiss";
    draftText?: string;
  };

  if (!projectId || !["approve", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const changes: Record<string, unknown> = { update_needed: false };
  if (action === "approve" && draftText) {
    changes.status_summary      = draftText.slice(0, 2000);
    changes.draft_status_update = "";
    changes.last_status_update  = new Date().toISOString().slice(0, 10);
  }

  const apply = await applyMirrorEdit({ table: "projects", id: projectId, changes });
  if (!apply.ok) {
    return NextResponse.json({ error: "Mirror update failed", detail: apply.error }, { status: 500 });
  }
  const push = await pushPending("projects", projectId);

  return NextResponse.json({
    ok: true,
    action,
    notion_push:  push.ok ? "ok" : "pending_retry",
    notion_error: push.ok ? undefined : push.error,
  });
}
