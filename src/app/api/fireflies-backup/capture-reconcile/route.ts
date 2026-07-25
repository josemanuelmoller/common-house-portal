/**
 * GET|POST /api/fireflies-backup/capture-reconcile
 *
 * Daily: matches Google Calendar meetings against Fireflies transcripts and
 * caches the result (matched / spontaneous / capture-gap) for the /admin panel.
 * Non-destructive. The transcript is the source of truth — the calendar only
 * flags scheduled meetings that were never captured.
 *
 * Param: days (default 45). Auth: x-agent-key / CRON_SECRET / Clerk admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { apiError } from "@/lib/api-error";
import { withRoutineLog } from "@/lib/routine-log";
import { runCaptureReconcile } from "@/lib/fireflies-backup";

export const maxDuration = 120;

async function authCheck(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  const agentKey = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (expected && agentKey === expected) return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* noop */ }
  return false;
}

async function run(days?: number) {
  try {
    const capture = await runCaptureReconcile(days ?? 45);
    return NextResponse.json({ ok: true, ...capture });
  } catch (err) {
    return apiError(err, { route: "[/api/fireflies-backup/capture-reconcile]", status: 502 });
  }
}

async function _POST(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const days = typeof body?.days === "number" && body.days > 0 ? body.days : undefined;
  return run(days);
}

async function _GET(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const daysP = Number(new URL(req.url).searchParams.get("days"));
  return run(Number.isFinite(daysP) && daysP > 0 ? daysP : undefined);
}

export const POST = withRoutineLog("fireflies-backup-capture", _POST);
export const GET = withRoutineLog("fireflies-backup-capture", _GET);
