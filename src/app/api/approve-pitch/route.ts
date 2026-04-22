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

type Action = "approve" | "reject" | "skip";

const VALID_ACTIONS: Action[] = ["approve", "reject", "skip"];

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const pitchId: string = body.pitchId;
  const action: Action  = body.action;
  const reason: string | undefined = body.reason;

  if (!pitchId || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "pitchId and action (approve|reject|skip) required" },
      { status: 400 }
    );
  }

  const statusMap = {
    approve: "approved",
    reject:  "rejected",
    skip:    "skipped",
  } as const;

  try {
    await updatePitchStatus(pitchId, statusMap[action], {
      rejected_reason: action === "reject" ? (reason ?? null) : undefined,
    });
    return NextResponse.json({ ok: true, status: statusMap[action] });
  } catch (e) {
    return NextResponse.json(
      { error: "update error", detail: String(e) },
      { status: 500 }
    );
  }
}
