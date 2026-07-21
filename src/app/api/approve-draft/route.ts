import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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

  try {
    const sb = getSupabaseServerClient();
    const nowIso = new Date().toISOString();
    // draftId here was historically the Notion page_id. Match against notion_id
    // (the canonical backref column) so existing UI references continue to work.
    const updates: Record<string, unknown> = { status: newStatus, updated_at: nowIso };
    if (newStatus === "Approved") {
      updates.approved_at = nowIso;
    }
    const { error } = await sb
      .from("agent_drafts")
      .update(updates)
      .eq("notion_id", draftId);
    if (error) {
      return NextResponse.json({ error: "Supabase update error", detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (e) {
    return NextResponse.json({ error: "agent_drafts update error" }, { status: 500 });
  }
}
