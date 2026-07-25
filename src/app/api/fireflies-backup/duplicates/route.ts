/**
 * GET /api/fireflies-backup/duplicates?days=200&window=45
 *
 * Read-only. Finds duplicate recordings of the same meeting — Fireflies often
 * captures one call several times (bot inside, "outside" capture when it wasn't
 * admitted, plus 1-min silent artifacts when the joiner bounced). Each fragment
 * burns storage minutes.
 *
 * Returns groups of { keep, drop[], minutes_reclaimable }. Deletes nothing —
 * dropping is done through the existing human-gated /prune route.
 *
 * Auth: x-agent-key / CRON_SECRET / Clerk admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { apiError } from "@/lib/api-error";
import { computeDuplicates } from "@/lib/fireflies-backup";

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

export async function GET(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const daysP = Number(url.searchParams.get("days"));
  const winP = Number(url.searchParams.get("window"));
  try {
    const result = await computeDuplicates(
      Number.isFinite(daysP) && daysP > 0 ? daysP : undefined,
      Number.isFinite(winP) && winP > 0 ? winP : undefined,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err, { route: "[/api/fireflies-backup/duplicates]", status: 502 });
  }
}
