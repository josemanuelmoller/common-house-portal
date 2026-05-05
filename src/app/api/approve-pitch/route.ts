/**
 * POST /api/approve-pitch
 *
 * Updates a content_pitches row in Supabase when JMM approves, rejects, or
 * skips a proposed pitch from the /admin/plan Comms tab.
 *
 * Body: { pitchId: string; action: "approve" | "reject" | "skip"; reason?: string }
 * Auth: admin session (Clerk).
 *
 * Approving a pitch does NOT trigger drafting here — drafting happens when
 * linkedin-post-agent runs (manual for now, cron later). This route just
 * moves the pitch to status=approved so the agent can pick it up.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { updatePitchStatus } from "@/lib/comms-strategy";
import { withRoutineLog } from "@/lib/routine-log";
import { recordProposalOutcomes, type ProposalAction } from "@/lib/proposal-outcomes";
import { currentUser } from "@clerk/nextjs/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type Action = "approve" | "reject" | "skip";

const VALID_ACTIONS: Action[] = ["approve", "reject", "skip"];

const ACTION_TO_OUTCOME: Record<Action, ProposalAction> = {
  approve: "approved",
  reject:  "rejected",
  skip:    "skipped",
};

async function _POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const pitchIds: string[] = Array.isArray(body.pitchIds) ? body.pitchIds : (body.pitchId ? [body.pitchId] : []);
  const action: Action  = body.action;
  const reason: string | undefined = body.reason;

  if (pitchIds.length === 0 || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "pitchId (or pitchIds[]) and action (approve|reject|skip) required" },
      { status: 400 }
    );
  }

  const statusMap = {
    approve: "approved",
    reject:  "rejected",
    skip:    "skipped",
  } as const;
  const newStatus = statusMap[action];

  // Snapshot pitch headlines BEFORE mutation so we keep meaningful titles in
  // proposal_outcomes even if the pitch row is later edited.
  let pitchTitles = new Map<string, string>();
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("content_pitches")
      .select("id, headline, angle")
      .in("id", pitchIds);
    pitchTitles = new Map(
      (data ?? []).map((p: { id: string; headline: string | null; angle: string | null }) => [
        p.id,
        p.headline ?? p.angle?.slice(0, 80) ?? "",
      ]),
    );
  } catch { /* best-effort snapshot */ }

  const errors: Array<{ id: string; error: string }> = [];
  const succeededIds: string[] = [];
  let written = 0;
  for (const id of pitchIds) {
    try {
      await updatePitchStatus(id, newStatus, {
        rejected_reason: action === "reject" ? (reason ?? null) : undefined,
      });
      written++;
      succeededIds.push(id);
    } catch (e) {
      errors.push({ id, error: String(e) });
    }
  }

  // Record human feedback — fire-and-forget batch insert.
  const user = await currentUser();
  void recordProposalOutcomes(
    succeededIds.map((id) => ({
      proposal_type:  "content_pitch" as const,
      proposal_id:    id,
      action:         ACTION_TO_OUTCOME[action],
      agent_name:     "propose-content-pitches",
      reason:         action === "reject" ? (reason ?? null) : null,
      actor_email:    user?.primaryEmailAddress?.emailAddress ?? null,
      proposal_title: pitchTitles.get(id) ?? null,
    })),
  );

  return NextResponse.json({
    ok: errors.length === 0,
    status: newStatus,
    records_read: pitchIds.length,
    records_written: written,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const POST = withRoutineLog("approve-pitch", _POST);
