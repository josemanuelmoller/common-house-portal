/**
 * GET /api/fireflies-backup/status?retention=60
 *
 * Read-only picture for the 30-day deletion review: how many meetings are
 * safely backed up to Drive, and how many are old enough (older than the
 * retention window) to be pruned from Fireflies. Nothing here deletes.
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET OR Clerk admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { apiError } from "@/lib/api-error";
import { statusReport, RETENTION_DAYS } from "@/lib/fireflies-backup";

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

export async function GET(req: NextRequest) {
  if (!(await authCheck(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const retentionParam = Number(url.searchParams.get("retention"));
  const retention = Number.isFinite(retentionParam) && retentionParam > 0 ? retentionParam : RETENTION_DAYS;

  try {
    const report = await statusReport(retention);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return apiError(err, { route: "[/api/fireflies-backup/status]" });
  }
}
