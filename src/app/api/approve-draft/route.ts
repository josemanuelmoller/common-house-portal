/**
 * POST /api/approve-draft
 *
 * Approves or requests revision on an Agent Draft.
 * Phase 2 pattern: Supabase mirror first (instant UI), best-effort push to Notion.
 *
 * Records the decision into proposal_outcomes for control-plane analytics.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { applyMirrorEdit, pushPending } from "@/lib/notion-mirror-push";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { recordProposalOutcome, type ProposalAction } from "@/lib/proposal-outcomes";
import { currentUser } from "@clerk/nextjs/server";

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

  // Snapshot draft metadata BEFORE mutation so we capture the title and the
  // generator that produced it (draft_type acts as our agent_name proxy).
  let draftTitle: string | null = null;
  let draftType: string | null = null;
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("notion_agent_drafts")
      .select("title, draft_type")
      .eq("id", draftId)
      .maybeSingle();
    draftTitle = data?.title ?? null;
    draftType = data?.draft_type ?? null;
  } catch { /* best-effort snapshot */ }

  const apply = await applyMirrorEdit({
    table:   "notion_agent_drafts",
    id:      draftId,
    changes: { status: newStatus },
  });
  if (!apply.ok) {
    return NextResponse.json({ error: "Mirror update failed", detail: apply.error }, { status: 500 });
  }

  const push = await pushPending("notion_agent_drafts", draftId);

  // Record human feedback — fire-and-forget, never blocks the response.
  const outcomeAction: ProposalAction = action === "approve" ? "approved" : "revision_requested";
  const user = await currentUser();
  void recordProposalOutcome({
    proposal_type: "agent_draft",
    proposal_id:   draftId,
    action:        outcomeAction,
    agent_name:    draftType, // e.g. "linkedin-post" / "draft-followup" / "draft-checkin"
    actor_email:   user?.primaryEmailAddress?.emailAddress ?? null,
    proposal_title: draftTitle,
  });

  return NextResponse.json({
    ok: true,
    status: newStatus,
    notion_push: push.ok ? "ok" : "pending_retry",
    notion_error: push.ok ? undefined : push.error,
  });
}
