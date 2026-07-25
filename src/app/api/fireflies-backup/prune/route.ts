/**
 * POST /api/fireflies-backup/prune
 *
 * Deletes approved old meetings from Fireflies to free storage. HUMAN-GATED:
 * body { ids: string[], execute?: boolean }. execute=false (default) returns a
 * dry-run of exactly what would be deleted; execute=true performs the deletion
 * behind a triple gate (backed up on Drive + older than retention + not already
 * deleted) and repoints source_url to the Drive copy.
 *
 * Auth: Clerk admin OR x-agent-key/CRON_SECRET. Deletion is irreversible, so
 * this is only ever driven by the admin panel with an explicit confirm.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { apiError } from "@/lib/api-error";
import { withRoutineLog } from "@/lib/routine-log";
import { pruneMeetings } from "@/lib/fireflies-backup";

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

async function _POST(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const execute = body?.execute === true;
  try {
    const result = await pruneMeetings({ ids, execute });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err, { route: "[/api/fireflies-backup/prune]", status: 502 });
  }
}

export const POST = withRoutineLog("fireflies-backup-prune", _POST);
