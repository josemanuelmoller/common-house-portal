/**
 * GET|POST /api/fireflies-backup/reconcile
 *
 * Lists Fireflies for a recent window, diffs against the `meeting_backups`
 * manifest, and backs up anything missing to Google Drive (Phase 1).
 * Non-destructive: never deletes, never repoints source_url.
 *
 * Params (POST body or GET query, all optional):
 *   - days:    lookback window (default 120). Use a large value for backfill.
 *   - cap:     max meetings to back up this run (default 40; rate-limit guard).
 *   - execute: dry-run flag. Default true (the daily cron backs up). Pass
 *              execute=false / {execute:false} for a dry-run report.
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET OR Clerk admin.
 * Cron (Vercel, GET): daily — see vercel.json.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { apiError } from "@/lib/api-error";
import { withRoutineLog } from "@/lib/routine-log";
import { reconcile } from "@/lib/fireflies-backup";

export const maxDuration = 300;

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

async function run(opts: { days?: number; cap?: number; execute?: boolean }) {
  try {
    const result = await reconcile(opts);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    return apiError(err, { route: "[/api/fireflies-backup/reconcile]", status: 502 });
  }
}

async function _POST(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const days = typeof body?.days === "number" && body.days > 0 ? body.days : undefined;
  const cap = typeof body?.cap === "number" && body.cap > 0 ? body.cap : undefined;
  const execute = body?.execute === false ? false : true;
  return run({ days, cap, execute });
}

// Vercel cron invokes GET. Defaults to execute=true so the daily run backs up.
async function _GET(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const daysP = Number(url.searchParams.get("days"));
  const capP = Number(url.searchParams.get("cap"));
  const days = Number.isFinite(daysP) && daysP > 0 ? daysP : undefined;
  const cap = Number.isFinite(capP) && capP > 0 ? capP : undefined;
  const execute = url.searchParams.get("execute") === "false" ? false : true;
  return run({ days, cap, execute });
}

export const POST = withRoutineLog("fireflies-backup-reconcile", _POST);
export const GET = withRoutineLog("fireflies-backup-reconcile", _GET);
