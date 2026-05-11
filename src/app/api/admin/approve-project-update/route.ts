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
// notion-cutoff-2026-06-02: removed; canonical write is now to projects (Supabase).
// import { Client } from "@notionhq/client";
// const notion = new Client({ auth: process.env.NOTION_API_KEY });
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
    // notion-cutoff-2026-06-02: replaced by canonical write to projects (Supabase).
    // Notion → Supabase column mapping:
    //   "Status Summary"         → status_summary
    //   "Draft Status Update"    → draft_status_update
    //   "Project Update Needed?" → update_needed
    //
    // const properties: Record<string, any> = { "Project Update Needed?": { checkbox: false } };
    // if (action === "approve" && draftText) {
    //   properties["Status Summary"] = { rich_text: [{ type: "text", text: { content: draftText.slice(0, 2000) } }] };
    //   properties["Draft Status Update"] = { rich_text: [] };
    // }
    // await notion.pages.update({ page_id: projectId, properties });
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
