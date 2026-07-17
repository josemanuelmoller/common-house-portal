/**
 * POST /api/state-refresh
 *
 * Incremental project state-refresh. Reads only NEW validated evidence since the
 * last accepted state change for each project and writes PROPOSALS to
 * project_state_proposals (status 'pending'). It never mutates project_states or
 * project_state_items, and never promotes an observation to a knowledge asset.
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET (requireCronAuth).
 * Intended cadence: daily, after evidence extraction/validation has run.
 *
 * Optional JSON body: { projectIds?: string[], lookbackDays?: number }.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/require-cron";
import { withRoutineLog } from "@/lib/routine-log";
import { runStateRefresh } from "@/lib/state-refresh";

export const maxDuration = 300;

async function _POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  let body: { projectIds?: string[]; lookbackDays?: number } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectIds = Array.isArray(body.projectIds)
    ? body.projectIds.filter((v): v is string => typeof v === "string")
    : undefined;
  const lookbackDays = typeof body.lookbackDays === "number" && body.lookbackDays > 0
    ? Math.min(body.lookbackDays, 180)
    : undefined;

  const summary = await runStateRefresh({ projectIds, lookbackDays });
  return NextResponse.json({ ok: true, ...summary });
}

export const POST = withRoutineLog("state-refresh", _POST);
export const GET = POST;
