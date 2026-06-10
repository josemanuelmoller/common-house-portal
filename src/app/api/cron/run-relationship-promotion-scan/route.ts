/**
 * GET /api/cron/run-relationship-promotion-scan
 *
 * Daily Vercel cron entrypoint for the relationship-promotion-operator scan
 * (mode=execute, limit=50) so any new "Engatel pattern" orgs surface in
 * /admin/os automatically.
 *
 * Calls runPromotionScan() IN-PROCESS. The previous version re-invoked
 * /api/admin/relationship-promotion/scan via fetch(req.nextUrl.origin) —
 * cron invocations arrive on the generated *.vercel.app URL, which sits
 * behind Vercel Authentication, so the internal fetch got the auth
 * interstitial and the cron logged "HTTP 502" daily while doing nothing.
 *
 * Auth: Authorization: Bearer $CRON_SECRET (Vercel cron) or x-agent-key.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRoutineLog } from "@/lib/routine-log";
import { runPromotionScan } from "@/lib/relationship-promotion-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function _GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const agentKey = req.headers.get("x-agent-key");
  if (auth !== cronSecret && agentKey !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPromotionScan({ mode: "execute", limit: 50 });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status: 500 });
  }
  return NextResponse.json(result);
}

export const GET = withRoutineLog("cron-run-relationship-promotion-scan", _GET);
export const POST = GET;
