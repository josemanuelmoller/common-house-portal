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
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  // adminGuardApi checks BOTH ADMIN_USER_IDS and ADMIN_EMAILS — the rest of the
  // codebase uses this helper; the older inline `isAdminUser(userId)`-only check
  // diverged from the project contract and could silently lock out legitimate
  // admins on prod where Clerk userIds drift from dev.
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { projectId, action, draftText } = await req.json() as {
    projectId: string;
    action: "approve" | "dismiss";
    draftText?: string;
  };

  if (!projectId || !["approve", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServerClient();
    const update: Record<string, unknown> = {
      update_needed: false,
      updated_at: new Date().toISOString(),
    };
    if (action === "approve" && draftText) {
      update.status_summary      = draftText.slice(0, 2000);
      update.draft_status_update = null;
    }

    // projectId here is historically the Notion page id; match the row by either
    // canonical uuid `id` or the `notion_id` backref column.
    const isUuid = /^[0-9a-f-]{36}$/i.test(projectId);
    const matchColumn = isUuid ? "id" : "notion_id";
    const { error } = await sb
      .from("projects")
      .update(update)
      .eq(matchColumn, projectId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, action });
  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
